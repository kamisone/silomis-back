import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';
import { CustomerSmsKind, renderAbandonedCartSms, renderCustomerSms, renderVerificationSms } from './customer-sms-copy';

/**
 * platform_settings key for the one switch over every customer-facing SMS.
 * Absent = on. Edited from Shop → Settings → Notifications; the same string
 * as ADMIN_NOTIF_KEYS.customerSmsEnabled, repeated here so the SMS module
 * does not import the notifications module that already imports it.
 */
export const CUSTOMER_SMS_ENABLED_KEY = 'customer_sms_enabled';

/** The slice of an order a customer SMS needs. */
export interface CustomerSmsOrder {
  id: string;
  orderNumber: string;
  customerPhone: string | null;
  customerLocale: string | null;
}

/**
 * Texts a customer about their order: the important moments only — confirmed,
 * payment failed, shipped, cancelled, a send-in item arriving / going back /
 * needing them, and the shop replying. Sent to every order that has a phone,
 * alongside the email when there is one too: for a phone-only order this is
 * the only channel the customer has.
 *
 * Messages go into the same outbox the admin alerts and MFA codes use (the
 * device gateway polls it), and every attempt lands in the notification log
 * under a `customer_*` event so the admin can see what a customer was sent.
 *
 * Never throws: an SMS is a courtesy on top of the order, and the caller is
 * always an event listener with its own work to finish.
 */
@Injectable()
export class CustomerSmsService {
  private readonly logger = new Logger(CustomerSmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.platformSettings.findUnique({ where: { key: CUSTOMER_SMS_ENABLED_KEY } });
    return row?.value !== 'false';
  }

  /** The order's tracking page, signed in by its token — the link every message carries. */
  trackingUrl(order: { orderNumber: string; trackingToken: string | null }, hash = ''): string | null {
    if (!order.trackingToken) return null;
    const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
    return `${appUrl}/shop/orders/track/${order.orderNumber}?token=${order.trackingToken}${hash}`;
  }

  async send(kind: CustomerSmsKind, order: CustomerSmsOrder, url: string | null): Promise<void> {
    if (!order.customerPhone) return;
    // Only a number the gateway can dial. One kept "as typed" at checkout (no
    // dialling code on file for the country) stays readable in the admin but
    // is not guessed at here.
    if (!order.customerPhone.startsWith('+')) {
      await this.log(kind, order, 'skipped', 'Phone not in international format');
      return;
    }
    try {
      if (!(await this.isEnabled())) {
        await this.log(kind, order, 'skipped', 'Customer SMS switched off');
        return;
      }
      await this.sms.addMessage(order.customerPhone, renderCustomerSms(kind, order.orderNumber, url, order.customerLocale));
      await this.log(kind, order, 'sent');
    } catch (err) {
      this.logger.error(`Customer SMS ${kind} failed for ${order.orderNumber}: ${(err as Error).message}`);
      await this.log(kind, order, 'failed', (err as Error).message);
    }
  }

  // ── Marketing: the abandoned-cart reminder ──────────────────────────────

  /**
   * The one marketing text. Unlike the order updates above it needs the
   * customer's tick at checkout (the caller checks it) and is never sent to a
   * number that replied STOP.
   */
  async sendAbandonedCart(phone: string, resumeUrl: string, locale: string | null, cartToken: string): Promise<void> {
    const log = (status: 'sent' | 'failed' | 'skipped', error?: string) =>
      this.writeLog({ event: 'customer_cart_abandoned', recipient: phone, status, error, metadata: { cartToken } });
    try {
      if (!phone.startsWith('+')) return log('skipped', 'Phone not in international format');
      if (!(await this.isEnabled())) return log('skipped', 'Customer SMS switched off');
      if (await this.isOptedOut(phone)) return log('skipped', 'Number replied STOP');
      await this.sms.addMessage(phone, renderAbandonedCartSms(resumeUrl, locale));
      await log('sent');
    } catch (err) {
      this.logger.error(`Abandoned-cart SMS failed for cart ${cartToken}: ${(err as Error).message}`);
      await log('failed', (err as Error).message);
    }
  }

  async isOptedOut(phone: string): Promise<boolean> {
    return !!(await this.prisma.smsOptOut.findUnique({ where: { phone } }));
  }

  /** Idempotent: a second STOP keeps the first one's date. */
  async recordOptOut(phone: string, source: 'stop_reply' | 'admin'): Promise<void> {
    await this.prisma.smsOptOut.upsert({ where: { phone }, create: { phone, source }, update: {} });
    await this.writeLog({ event: 'customer_sms_opt_out', recipient: phone, status: 'sent', error: undefined, metadata: { source } });
  }

  // ── Checkout phone verification ─────────────────────────────────────────

  /**
   * Throws when it cannot queue the text, so the checkout can say so instead
   * of leaving the customer waiting for a code that is not coming. Not gated
   * by the customer-SMS switch: the customer asked for this one. The code
   * itself never reaches the log.
   */
  async sendVerificationCode(phone: string, code: string, locale: string | null): Promise<void> {
    try {
      await this.sms.addMessage(phone, renderVerificationSms(code, locale));
      await this.writeLog({ event: 'customer_phone_code', recipient: phone, status: 'sent' });
    } catch (err) {
      await this.writeLog({ event: 'customer_phone_code', recipient: phone, status: 'failed', error: (err as Error).message });
      throw err;
    }
  }

  private log(kind: CustomerSmsKind, order: CustomerSmsOrder, status: 'sent' | 'failed' | 'skipped', error?: string): Promise<void> {
    return this.writeLog({ event: `customer_${kind}`, recipient: order.customerPhone ?? '', status, error, orderId: order.id, orderNumber: order.orderNumber });
  }

  private async writeLog(entry: {
    event: string;
    recipient: string;
    status: 'sent' | 'failed' | 'skipped';
    error?: string;
    orderId?: string;
    orderNumber?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    try {
      await this.prisma.commerceNotificationLog.create({
        data: {
          event: entry.event,
          channel: 'sms',
          recipient: entry.recipient,
          status: entry.status,
          orderId: entry.orderId ?? null,
          orderNumber: entry.orderNumber ?? null,
          error: entry.error ?? null,
          ...(entry.metadata ? { metadata: entry.metadata } : {}),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write customer SMS log: ${(err as Error).message}`);
    }
  }
}
