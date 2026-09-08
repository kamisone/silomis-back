import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShopEmailService } from '../email/shop-email.service';
import { EmailTransportService } from '../email/email-transport.service';
import { SmsService } from '../sms/sms.service';
import {
  ADMIN_NOTIF_DEFAULTS,
  ADMIN_NOTIF_EVENTS,
  ADMIN_NOTIF_KEYS,
  AdminNotifEvent,
  AdminNotifSettings,
} from './commerce-notification.constants';

export { ADMIN_NOTIF_EVENTS, AdminNotifEvent, AdminNotifSettings } from './commerce-notification.constants';

export interface NotifyPayload {
  event: AdminNotifEvent;
  orderId?: string;
  orderNumber?: string;
  summary: string;
  detailUrl?: string | null;
}

/** Who a given event goes out to, once the settings have been applied. */
export interface NotifRecipients {
  emails: string[];
  phones: string[];
}

/**
 * Owns the admin-notification settings (which events page the team, over which
 * channel, to whom) and the send log — one notify() call is the single gate
 * deciding whether an event is enabled before attempting anything, mirroring
 * the reference project's CommerceNotificationService.
 *
 * Callers that need their own email template (low-stock alerts) go through
 * resolveRecipients() + logDelivery() instead, so they share the same gate,
 * the same recipient lists and the same log without giving up their template.
 */
@Injectable()
export class CommerceNotificationService {
  private readonly logger = new Logger(CommerceNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: ShopEmailService,
    private readonly transport: EmailTransportService,
    private readonly sms: SmsService,
  ) {}

  // ── Settings ───────────────────────────────────────────────────────────

  async getSettings(): Promise<AdminNotifSettings> {
    const rows = await this.prisma.platformSettings.findMany({
      where: { key: { in: Object.values(ADMIN_NOTIF_KEYS) } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    // A missing key means "never configured" and takes the default. A key that
    // is present but empty is a deliberate "none", and is honoured as such —
    // an admin who unticks every event must not have them handed back.
    const bool = (key: string, fallback: boolean) => {
      const raw = map.get(key);
      return raw === undefined ? fallback : raw === 'true';
    };
    const list = (key: string, fallback: string[]) => {
      const raw = map.get(key);
      if (raw === undefined) return [...fallback];
      return raw.split(',').map((v) => v.trim()).filter(Boolean);
    };

    return {
      smsEnabled: bool(ADMIN_NOTIF_KEYS.smsEnabled, ADMIN_NOTIF_DEFAULTS.smsEnabled),
      smsPhones: list(ADMIN_NOTIF_KEYS.smsPhones, ADMIN_NOTIF_DEFAULTS.smsPhones),
      emailEnabled: bool(ADMIN_NOTIF_KEYS.emailEnabled, ADMIN_NOTIF_DEFAULTS.emailEnabled),
      emailAddresses: list(ADMIN_NOTIF_KEYS.emailAddresses, ADMIN_NOTIF_DEFAULTS.emailAddresses),
      events: list(ADMIN_NOTIF_KEYS.events, ADMIN_NOTIF_DEFAULTS.events).filter(this.isKnownEvent),
    };
  }

  async updateSettings(patch: Partial<AdminNotifSettings>): Promise<AdminNotifSettings> {
    const writes: Array<{ key: string; value: string }> = [];

    if (patch.smsEnabled !== undefined) writes.push({ key: ADMIN_NOTIF_KEYS.smsEnabled, value: String(patch.smsEnabled) });
    if (patch.emailEnabled !== undefined) writes.push({ key: ADMIN_NOTIF_KEYS.emailEnabled, value: String(patch.emailEnabled) });
    if (patch.smsPhones !== undefined) writes.push({ key: ADMIN_NOTIF_KEYS.smsPhones, value: this.normalizePhones(patch.smsPhones).join(',') });
    if (patch.emailAddresses !== undefined) writes.push({ key: ADMIN_NOTIF_KEYS.emailAddresses, value: this.normalizeEmails(patch.emailAddresses).join(',') });
    if (patch.events !== undefined) writes.push({ key: ADMIN_NOTIF_KEYS.events, value: patch.events.filter(this.isKnownEvent).join(',') });

    for (const { key, value } of writes) {
      await this.prisma.platformSettings.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    return this.getSettings();
  }

  // ── Send ───────────────────────────────────────────────────────────────

  async notify(payload: NotifyPayload): Promise<void> {
    const recipients = await this.resolveRecipients(payload.event);
    if (!recipients) return; // gated out — no log row at all

    for (const address of recipients.emails) {
      if (!this.transport.isConfigured()) {
        await this.logDelivery(payload.event, 'email', address, 'skipped', 'SMTP not configured', payload);
        continue;
      }
      try {
        await this.email.sendAdminOrderAlert(address, payload.event, { summary: payload.summary, detailUrl: payload.detailUrl ?? null });
        await this.logDelivery(payload.event, 'email', address, 'sent', undefined, payload);
      } catch (err) {
        await this.logDelivery(payload.event, 'email', address, 'failed', (err as Error).message, payload);
      }
    }

    for (const phone of recipients.phones) {
      try {
        await this.sms.addMessage(phone, this.smsBody(payload));
        await this.logDelivery(payload.event, 'sms', phone, 'sent', undefined, payload);
      } catch (err) {
        await this.logDelivery(payload.event, 'sms', phone, 'failed', (err as Error).message, payload);
      }
    }
  }

  /**
   * Who this event reaches, or null when it is switched off entirely.
   *
   * An empty recipient list is not "nobody" — it means "every admin account",
   * which is what silomis did before the lists existed and what a fresh
   * install still does. Narrowing to specific numbers is the opt-in.
   */
  async resolveRecipients(event: AdminNotifEvent): Promise<NotifRecipients | null> {
    const settings = await this.getSettings();
    if (!settings.events.includes(event)) return null;

    const needsAdminFallback =
      (settings.emailEnabled && settings.emailAddresses.length === 0) ||
      (settings.smsEnabled && settings.smsPhones.length === 0);
    const admins = needsAdminFallback ? await this.prisma.admin.findMany({ select: { email: true, phone: true } }) : [];

    const emails = !settings.emailEnabled
      ? []
      : settings.emailAddresses.length > 0
        ? settings.emailAddresses
        : admins.map((a) => a.email);

    const phones = !settings.smsEnabled
      ? []
      : settings.smsPhones.length > 0
        ? settings.smsPhones
        : admins.map((a) => a.phone).filter((p): p is string => !!p);

    if (emails.length === 0 && phones.length === 0) return null;
    return { emails, phones };
  }

  /**
   * Brand tag + summary, then the order number and a deep link on their own
   * lines — matching the reference project. A phone alert is only worth
   * reading if it says which order it is and gets you there in one tap.
   *
   * Unlike the reference project, `detailUrl` arrives absolute here
   * (AdminOrderAlertListener builds it from APP_URL), so it is used as-is
   * rather than prefixed a second time. A build without APP_URL passes null
   * and the line is simply dropped.
   */
  private smsBody(payload: NotifyPayload): string {
    const seller = process.env.SELLER_NAME ?? 'Silomis';
    const lines = [`[${seller}] ${payload.summary}`];
    if (payload.orderNumber) lines.push(`#${payload.orderNumber}`);
    if (payload.detailUrl) lines.push(payload.detailUrl);
    return lines.join('\n');
  }

  // ── Logs ───────────────────────────────────────────────────────────────

  async getLogs(filter: { channel?: string; event?: string; status?: string; limit?: number; offset?: number } = {}) {
    const { channel, event, status, limit = 50, offset = 0 } = filter;
    const where = {
      ...(channel ? { channel } : {}),
      ...(event ? { event } : {}),
      ...(status ? { status } : {}),
    };
    const [logs, total] = await Promise.all([
      this.prisma.commerceNotificationLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200), skip: offset }),
      this.prisma.commerceNotificationLog.count({ where }),
    ]);
    return { logs, total };
  }

  async logDelivery(
    event: AdminNotifEvent,
    channel: 'sms' | 'email',
    recipient: string,
    status: 'sent' | 'failed' | 'skipped',
    error?: string,
    order?: { orderId?: string; orderNumber?: string },
  ): Promise<void> {
    try {
      await this.prisma.commerceNotificationLog.create({
        data: { event, channel, recipient, status, orderId: order?.orderId ?? null, orderNumber: order?.orderNumber ?? null, error: error ?? null },
      });
    } catch (err) {
      this.logger.warn(`Failed to write notification log: ${(err as Error).message}`);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────

  private isKnownEvent = (value: string): value is AdminNotifEvent =>
    (ADMIN_NOTIF_EVENTS as readonly string[]).includes(value);

  /**
   * Stored comma-separated, so a number keeps no spaces; `00` is rewritten to
   * `+` because the two are interchangeable when dialling but not when the SMS
   * gateway matches on the string.
   */
  private normalizePhones(phones: string[]): string[] {
    const cleaned = phones.map((p) => p.replace(/\s+/g, '').replace(/^00/, '+')).filter(Boolean);
    return [...new Set(cleaned)];
  }

  private normalizeEmails(addresses: string[]): string[] {
    const cleaned = addresses.map((a) => a.trim().toLowerCase()).filter(Boolean);
    return [...new Set(cleaned)];
  }
}
