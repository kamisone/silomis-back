import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShopEmailService } from '../email/shop-email.service';
import { EmailTransportService } from '../email/email-transport.service';
import { SmsService } from '../sms/sms.service';

const SETTINGS_KEY = 'admin_notif_events';
export const ADMIN_NOTIF_EVENTS = ['payment_succeeded', 'payment_failed', 'order_cancelled'] as const;
export type AdminNotifEvent = (typeof ADMIN_NOTIF_EVENTS)[number];

export interface NotifyPayload {
  event: AdminNotifEvent;
  orderId?: string;
  orderNumber?: string;
  summary: string;
  detailUrl?: string | null;
}

/**
 * Owns both the admin-notification settings (which events page the admin
 * team) and the send log — one notify() call is the single gate deciding
 * whether an event is enabled before attempting anything, exactly mirroring
 * the reference project's CommerceNotificationService. Fans out to every
 * Admin row's email + phone, the same target set LowStockAlertListener
 * already uses, rather than a separately-configured recipient list.
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

  async getSettings(): Promise<{ events: AdminNotifEvent[] }> {
    const row = await this.prisma.platformSettings.findUnique({ where: { key: SETTINGS_KEY } });
    const enabled = (row?.value ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter((e): e is AdminNotifEvent => (ADMIN_NOTIF_EVENTS as readonly string[]).includes(e));
    return { events: enabled };
  }

  async updateSettings(events: AdminNotifEvent[]): Promise<{ events: AdminNotifEvent[] }> {
    const valid = events.filter((e) => (ADMIN_NOTIF_EVENTS as readonly string[]).includes(e));
    await this.prisma.platformSettings.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: valid.join(',') }, update: { value: valid.join(',') } });
    return { events: valid };
  }

  async getLogs(filter: { channel?: string; event?: string; status?: string; limit?: number; offset?: number } = {}) {
    const { channel, event, status, limit = 50, offset = 0 } = filter;
    const where = {
      ...(channel ? { channel } : {}),
      ...(event ? { event } : {}),
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([this.prisma.commerceNotificationLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200), skip: offset }), this.prisma.commerceNotificationLog.count({ where })]);
    return { items, total };
  }

  async notify(payload: NotifyPayload): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.events.includes(payload.event)) return; // gated out — no log row at all

    const admins = await this.prisma.admin.findMany({ select: { email: true, phone: true } });
    await Promise.allSettled(admins.map((admin) => this.sendToAdmin(admin, payload)));
  }

  private async sendToAdmin(admin: { email: string; phone: string | null }, payload: NotifyPayload): Promise<void> {
    if (!this.transport.isConfigured()) {
      await this.log(payload, 'email', admin.email, 'skipped', 'SMTP not configured');
    } else {
      try {
        await this.email.sendAdminOrderAlert(admin.email, payload.event, { summary: payload.summary, detailUrl: payload.detailUrl ?? null });
        await this.log(payload, 'email', admin.email, 'sent');
      } catch (err) {
        await this.log(payload, 'email', admin.email, 'failed', (err as Error).message);
      }
    }

    if (admin.phone) {
      try {
        await this.sms.addMessage(admin.phone, `[Silomis] ${payload.summary}`);
        await this.log(payload, 'sms', admin.phone, 'sent');
      } catch (err) {
        await this.log(payload, 'sms', admin.phone, 'failed', (err as Error).message);
      }
    }
  }

  private async log(payload: NotifyPayload, channel: 'sms' | 'email', recipient: string, status: 'sent' | 'failed' | 'skipped', error?: string): Promise<void> {
    try {
      await this.prisma.commerceNotificationLog.create({
        data: { event: payload.event, channel, recipient, status, orderId: payload.orderId ?? null, orderNumber: payload.orderNumber ?? null, error: error ?? null },
      });
    } catch (err) {
      this.logger.warn(`Failed to write notification log: ${(err as Error).message}`);
    }
  }
}
