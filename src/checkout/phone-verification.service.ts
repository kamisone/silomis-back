import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CustomerSmsService } from '../sms/customer-sms.service';
import { toE164 } from '../common/utils/phone';

/** platform_settings key: "true" asks a customer who gave no email to confirm their phone by code. Absent = off. */
export const CHECKOUT_PHONE_VERIFICATION_KEY = 'checkout_phone_verification';

const CODE_TTL_SEC = 10 * 60;
/** A confirmed phone stays confirmed for this long on the cart — a refresh or a step back must not ask again. */
const VERIFIED_TTL_SEC = 6 * 60 * 60;
const MAX_ATTEMPTS = 5;
/** Between two sends to one cart. The gateway phone can take a little while; this stops impatient double taps. */
const RESEND_AFTER_SEC = 30;
/** Per number per hour, whatever the cart — the abuse to stop is texting a stranger's phone over and over. */
const MAX_SENDS_PER_PHONE_PER_HOUR = 5;

/**
 * Error codes the storefront switches on. Sent as `code` beside the message,
 * because the message is for a person and may change.
 */
export const PHONE_VERIFICATION_ERRORS = {
  required: 'PHONE_VERIFICATION_REQUIRED',
  invalidCode: 'INVALID_CODE',
  expired: 'CODE_EXPIRED',
  tooManyAttempts: 'TOO_MANY_ATTEMPTS',
  tooSoon: 'RESEND_TOO_SOON',
  tooManySends: 'TOO_MANY_SENDS',
  invalidPhone: 'INVALID_PHONE',
} as const;

interface PendingCode {
  phone: string;
  hash: string;
  attempts: number;
}

/**
 * Confirms that a customer who checked out with a phone only can actually
 * receive texts on it, before the order exists: for such an order the phone is
 * the only way the shop can reach them, and a typo means a paid order nobody
 * can talk to.
 *
 * Off by default (Shop → Settings → Notifications). The code goes through the
 * Android gateway like every other text, so it is only as quick as that phone
 * polls — the checkout always leaves the customer the way out of adding an
 * email instead.
 *
 * State lives in Redis per cart: the pending code (hashed, with its phone and
 * attempt count) and, once confirmed, the confirmed phone. Bound to the cart
 * token so a code cannot be reused for another basket.
 */
@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sms: CustomerSmsService,
  ) {}

  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.platformSettings.findUnique({ where: { key: CHECKOUT_PHONE_VERIFICATION_KEY } });
    return row?.value === 'true';
  }

  /** Whether this checkout must confirm its phone: the switch is on and the phone is the only contact. */
  async isRequired(contact: { email: string | null; phone: string | null }): Promise<boolean> {
    return !contact.email && !!contact.phone && (await this.isEnabled());
  }

  async isVerified(cartToken: string, phoneE164: string): Promise<boolean> {
    const verified = await this.redis.client.get(this.verifiedKey(cartToken));
    return verified === phoneE164;
  }

  async sendCode(cartToken: string, rawPhone: string, country: string, locale: string | null): Promise<{ resendAfterSec: number; maskedPhone: string }> {
    const phone = await this.normalize(rawPhone, country);

    // Per cart: one send per RESEND_AFTER_SEC.
    const cooldownKey = `checkout:otp:cd:${cartToken}`;
    if (!(await this.redis.client.set(cooldownKey, '1', 'EX', RESEND_AFTER_SEC, 'NX'))) {
      const ttl = await this.redis.client.ttl(cooldownKey);
      throw new HttpException({ code: PHONE_VERIFICATION_ERRORS.tooSoon, message: 'Please wait before asking for a new code', retryAfterSec: Math.max(ttl, 1) }, HttpStatus.TOO_MANY_REQUESTS);
    }
    // Per number: the stranger's-phone abuse.
    const phoneKey = `checkout:otp:phone:${phone}`;
    const sends = await this.redis.client.incr(phoneKey);
    if (sends === 1) await this.redis.client.expire(phoneKey, 3600);
    if (sends > MAX_SENDS_PER_PHONE_PER_HOUR) {
      throw new HttpException({ code: PHONE_VERIFICATION_ERRORS.tooManySends, message: 'Too many codes sent to this number, try again later' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const pending: PendingCode = { phone, hash: this.hash(cartToken, code), attempts: 0 };
    await this.redis.client.set(this.codeKey(cartToken), JSON.stringify(pending), 'EX', CODE_TTL_SEC);

    try {
      await this.sms.sendVerificationCode(phone, code, locale);
    } catch (err) {
      this.logger.error(`Verification code for cart ${cartToken} could not be queued: ${(err as Error).message}`);
      await this.redis.client.del(this.codeKey(cartToken), cooldownKey);
      throw new ServiceUnavailableException('The code could not be sent');
    }
    return { resendAfterSec: RESEND_AFTER_SEC, maskedPhone: this.mask(phone) };
  }

  async verify(cartToken: string, rawPhone: string, country: string, code: string): Promise<{ verified: true }> {
    const phone = await this.normalize(rawPhone, country);
    const raw = await this.redis.client.get(this.codeKey(cartToken));
    // No code, or one sent to another number (the customer changed the field
    // since): either way the code they hold is not for this phone.
    if (!raw) throw this.fail(PHONE_VERIFICATION_ERRORS.expired, 'This code has expired, ask for a new one');
    const pending = JSON.parse(raw) as PendingCode;
    if (pending.phone !== phone) throw this.fail(PHONE_VERIFICATION_ERRORS.expired, 'This code was sent to another number, ask for a new one');

    const given = this.hash(cartToken, code.replace(/\D/g, ''));
    if (!timingSafeEqual(Buffer.from(given), Buffer.from(pending.hash))) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_ATTEMPTS) {
        await this.redis.client.del(this.codeKey(cartToken));
        throw this.fail(PHONE_VERIFICATION_ERRORS.tooManyAttempts, 'Too many wrong codes, ask for a new one');
      }
      const ttl = await this.redis.client.ttl(this.codeKey(cartToken));
      await this.redis.client.set(this.codeKey(cartToken), JSON.stringify(pending), 'EX', Math.max(ttl, 1));
      throw this.fail(PHONE_VERIFICATION_ERRORS.invalidCode, 'That code is not right');
    }

    await this.redis.client.del(this.codeKey(cartToken));
    await this.redis.client.set(this.verifiedKey(cartToken), phone, 'EX', VERIFIED_TTL_SEC);
    return { verified: true };
  }

  private async normalize(rawPhone: string, country: string): Promise<string> {
    const row = await this.prisma.country.findUnique({ where: { isoCode: country.toUpperCase() }, select: { phonePrefix: true } });
    const phone = toE164(rawPhone, row?.phonePrefix);
    if (!phone) throw this.fail(PHONE_VERIFICATION_ERRORS.invalidPhone, 'Invalid phone number');
    return phone;
  }

  /** Salted with the cart token so a code is worthless outside its basket. Six digits are not a secret worth bcrypt. */
  private hash(cartToken: string, code: string): string {
    return createHash('sha256').update(`${cartToken}:${code}`).digest('hex');
  }

  private fail(code: string, message: string): BadRequestException {
    return new BadRequestException({ code, message });
  }

  /** +33612345678 → +33 •••• 78: enough to recognise, not enough to harvest. */
  private mask(phone: string): string {
    return `${phone.slice(0, 3)} •••• ${phone.slice(-2)}`;
  }

  private codeKey(cartToken: string): string {
    return `checkout:otp:${cartToken}`;
  }

  private verifiedKey(cartToken: string): string {
    return `checkout:otp-ok:${cartToken}`;
  }
}
