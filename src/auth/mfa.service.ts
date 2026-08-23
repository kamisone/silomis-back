import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MfaMethod } from '../../generated/prisma/client';
import { AdminsService } from '../admins/admins.service';
import { RedisService } from '../redis/redis.service';
import { MfaNotificationService } from './mfa-notification.service';

export interface MfaChallengePayload {
  sub: string;
  email: string;
  jti: string;
  type: 'mfa-challenge';
}

export interface MfaChallengeResult {
  challengeToken: string;
  availableMethods: MfaMethod[];
  preferredMethod: MfaMethod;
  maskedDestination: string;
}

const OTP_TTL_SEC = 5 * 60;
const COOLDOWN_SEC = 60; // sliding window duration in seconds
const COOLDOWN_MAX = 5; // sends allowed within that window before blocking
const RL_MAX = 5;
const RL_TTL_SEC = 15 * 60;

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly notifications: MfaNotificationService,
  ) {}

  async initChallenge(adminId: string, email: string, preferredMethod: MfaMethod): Promise<MfaChallengeResult> {
    const admin = await this.adminsService.findById(adminId);
    if (!admin) {
      this.logger.warn(`initChallenge: admin ${adminId} not found`);
      throw new UnauthorizedException({ code: 'challenge_invalid' });
    }

    const availableMethods: MfaMethod[] = ['email'];
    if (admin.phone) availableMethods.push('sms');

    const jti = crypto.randomUUID();
    const payload: MfaChallengePayload = { sub: adminId, email, jti, type: 'mfa-challenge' };
    const challengeToken = this.jwtService.sign(payload, {
      secret: process.env.MFA_CHALLENGE_SECRET ?? process.env.JWT_SECRET,
      expiresIn: '5m',
    });

    const method = availableMethods.includes(preferredMethod) ? preferredMethod : availableMethods[0];
    const maskedDestination = await this.sendOtp(admin, jti, method);

    return { challengeToken, availableMethods, preferredMethod: method, maskedDestination };
  }

  async resend(challengeToken: string, method?: MfaMethod): Promise<{ maskedDestination: string }> {
    const payload = this.verifyChallengeToken(challengeToken);
    const admin = await this.adminsService.findById(payload.sub);
    if (!admin) {
      this.logger.warn(`resend: admin ${payload.sub} not found`);
      throw new UnauthorizedException({ code: 'challenge_invalid' });
    }

    const availableMethods: MfaMethod[] = ['email'];
    if (admin.phone) availableMethods.push('sms');

    if (method && !availableMethods.includes(method)) {
      this.logger.warn(`resend: method ${method} not available for admin ${payload.sub} (no phone)`);
      throw new BadRequestException({ code: 'method_unavailable' });
    }

    const chosenMethod = method ?? admin.preferredMfaMethod;
    const maskedDestination = await this.sendOtp(admin, payload.jti, chosenMethod);
    return { maskedDestination };
  }

  async verify(challengeToken: string, otp: string): Promise<{ adminId: string; email: string }> {
    const payload = this.verifyChallengeToken(challengeToken);
    const storedHash = await this.redis.client.get(`mfa:otp:${payload.jti}`);

    if (!storedHash) {
      this.logger.warn(`verify: OTP not found or expired for jti=${payload.jti}`);
      throw new BadRequestException({ code: 'otp_expired' });
    }

    const valid = await bcrypt.compare(otp, storedHash);
    if (!valid) {
      this.logger.warn(`verify: wrong OTP for jti=${payload.jti}`);
      throw new BadRequestException({ code: 'otp_invalid' });
    }

    await this.redis.client.del(`mfa:otp:${payload.jti}`);
    return { adminId: payload.sub, email: payload.email };
  }

  // ── private ────────────────────────────────────────────────────────────

  private verifyChallengeToken(token: string): MfaChallengePayload {
    try {
      const payload = this.jwtService.verify<MfaChallengePayload>(token, {
        secret: process.env.MFA_CHALLENGE_SECRET ?? process.env.JWT_SECRET,
      });
      if (payload.type !== 'mfa-challenge') throw new Error('wrong type');
      return payload;
    } catch (err: unknown) {
      this.logger.warn(`verifyChallengeToken failed: ${(err as Error)?.message}`);
      throw new UnauthorizedException({ code: 'challenge_invalid' });
    }
  }

  private async sendOtp(
    admin: { id: string; email: string; phone: string | null },
    jti: string,
    method: MfaMethod,
  ): Promise<string> {
    const rlKey = `mfa:rl:${admin.id}`;
    const count = await this.redis.client.incr(rlKey);
    if (count === 1) await this.redis.client.expire(rlKey, RL_TTL_SEC);
    if (count > RL_MAX) {
      this.logger.warn(`sendOtp: rate limit hit for admin ${admin.id} (${count} attempts)`);
      throw new HttpException({ code: 'rate_limited' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const cdKey = `mfa:cd:${admin.id}`;
    const cdCount = await this.redis.client.incr(cdKey);
    if (cdCount === 1) await this.redis.client.expire(cdKey, COOLDOWN_SEC);
    if (cdCount > COOLDOWN_MAX) {
      this.logger.warn(`sendOtp: cooldown active for admin ${admin.id} (${cdCount} sends in ${COOLDOWN_SEC}s window)`);
      throw new HttpException({ code: 'cooldown' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(otp, 10);
    await this.redis.client.set(`mfa:otp:${jti}`, hash, 'EX', OTP_TTL_SEC);

    if (method === 'sms') {
      await this.notifications.sendSms(admin.phone!, otp);
      return this.maskPhone(admin.phone!);
    } else {
      await this.notifications.sendEmail(admin.email, otp);
      return this.maskEmail(admin.email);
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
  }
}
