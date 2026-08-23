import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { SmsService } from '../sms/sms.service';
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
    private readonly smsService: SmsService,
  ) {
    super(dlqService);
  }

  async process(job: Job<{ conversationId: string }>): Promise<void> {
    const { conversationId } = job.data;

    const conv = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) return;

    const settings = await this.notifService.getSettings();

    // Debounce: skip if notified within cooldown window
    if (conv.lastNotifiedAt) {
      const cooldownMs = settings.smsCooldownMin * 60_000;
      if (Date.now() - conv.lastNotifiedAt.getTime() < cooldownMs) {
        this.logger.log(
          `Support notif skipped (cooldown) conv=${conversationId}`,
        );
        await this.log(conversationId, 'skipped');
        return;
      }
    }

    if (!settings.smsEnabled || settings.smsPhones.length === 0) {
      await this.log(conversationId, 'skipped', undefined, {
        reason: 'disabled_or_no_phones',
      });
      return;
    }

    const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const message = `[Support] New customer message\n${conv.guestName ? `From: ${conv.guestName}\n` : ''}${appUrl}/admin/support?conv=${conversationId}`;

    try {
      for (const phone of settings.smsPhones) {
        await this.smsService.addMessage(phone, message);
      }
      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: { lastNotifiedAt: new Date() },
      });
      await this.log(conversationId, 'sent', undefined, {
        phones: settings.smsPhones,
      });
      this.logger.log(`Support SMS sent conv=${conversationId}`);
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
