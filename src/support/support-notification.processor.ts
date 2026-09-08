import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { CommerceNotificationService } from '../commerce-notifications/commerce-notification.service';
import { SupportNotificationService } from './support-notification.service';
import { SUPPORT_QUEUE } from './support.constants';

@Processor(SUPPORT_QUEUE)
export class SupportNotificationProcessor extends DlqAwareWorker {
  protected readonly queueName = SUPPORT_QUEUE;
  private readonly logger = new Logger(SupportNotificationProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly prisma: PrismaService,
    private readonly notifService: SupportNotificationService,
    private readonly notifications: CommerceNotificationService,
  ) {
    super(dlqService);
  }

  /**
   * Channels, recipients and the on/off switch all come from Shop → Settings →
   * Notifications under the `support_message` event, so a support alert reaches
   * exactly the people every other admin alert reaches. What stays here is the
   * per-conversation cooldown, which is support's own concern: a guest sending
   * six messages in a row must not send six texts.
   *
   * The support log still records the decisions notify() cannot see — the
   * cooldown skip in particular, which returns before any send is attempted.
   */
  async process(job: Job<{ conversationId: string }>): Promise<void> {
    const { conversationId } = job.data;

    const conv = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) return;

    const settings = await this.notifService.getSettings();

    if (conv.lastNotifiedAt) {
      const cooldownMs = settings.smsCooldownMin * 60_000;
      if (Date.now() - conv.lastNotifiedAt.getTime() < cooldownMs) {
        this.logger.log(`Support notif skipped (cooldown) conv=${conversationId}`);
        await this.log(conversationId, 'skipped', undefined, { reason: 'cooldown' });
        return;
      }
    }

    const recipients = await this.notifications.resolveRecipients('support_message');
    if (!recipients) {
      await this.log(conversationId, 'skipped', undefined, { reason: 'event_disabled_or_no_recipients' });
      return;
    }

    const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
    try {
      await this.notifications.notify({
        event: 'support_message',
        summary: conv.guestName ? `New support message from ${conv.guestName}` : 'New support message',
        detailUrl: appUrl ? `${appUrl}/admin/support?conv=${conversationId}` : null,
      });
      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: { lastNotifiedAt: new Date() },
      });
      await this.log(conversationId, 'sent', undefined, {
        emails: recipients.emails.length,
        phones: recipients.phones.length,
      });
      this.logger.log(`Support alert sent conv=${conversationId}`);
    } catch (err) {
      const error = (err as Error).message;
      await this.log(conversationId, 'failed', error);
      throw err; // triggers BullMQ retry
    }
  }

  private async log(
    conversationId: string,
    status: string,
    providerResponse?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.supportNotificationLog.create({
      data: {
        conversationId,
        notificationType: 'sms',
        status,
        providerResponse: providerResponse ?? null,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }
}
