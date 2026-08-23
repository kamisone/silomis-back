import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import {
  NewsletterCampaignStatus,
  NewsletterRecipientStatus,
} from '../../generated/prisma/client';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import { NewsletterMailerService } from './newsletter-mailer.service';
import {
  NEWSLETTER_BATCH_DELAY_MS,
  NEWSLETTER_BATCH_SIZE,
  NEWSLETTER_CAMPAIGN_QUEUE,
  NewsletterCampaignJobData,
} from './newsletter.constants';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Processor(NEWSLETTER_CAMPAIGN_QUEUE)
export class NewsletterCampaignProcessor extends DlqAwareWorker {
  protected readonly queueName = NEWSLETTER_CAMPAIGN_QUEUE;
  private readonly logger = new Logger(NewsletterCampaignProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly prisma: PrismaService,
    private readonly campaignsService: NewsletterCampaignsService,
    private readonly mailer: NewsletterMailerService,
  ) {
    super(dlqService);
  }

  async process(job: Job<NewsletterCampaignJobData>): Promise<void> {
    const { campaignId } = job.data;
    const campaign = await this.prisma.newsletterCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign || campaign.status === NewsletterCampaignStatus.cancelled) {
      this.logger.log(`Campaign ${campaignId} missing or cancelled — skipping`);
      return;
    }

    if (campaign.status !== NewsletterCampaignStatus.sending) {
      await this.prisma.newsletterCampaign.update({
        where: { id: campaignId },
        data: { status: NewsletterCampaignStatus.sending },
      });
    }

    await this.campaignsService.materializeRecipients(campaignId);

    for (;;) {
      const pending = await this.prisma.newsletterCampaignRecipient.findMany({
        where: { campaignId, status: NewsletterRecipientStatus.pending },
        take: NEWSLETTER_BATCH_SIZE,
      });

      if (pending.length === 0) break;

      for (const recipient of pending) {
        await this.sendToRecipient(campaign, recipient);
      }

      await sleep(NEWSLETTER_BATCH_DELAY_MS);
    }

    await this.prisma.newsletterCampaign.update({
      where: { id: campaignId },
      data: { status: NewsletterCampaignStatus.sent, sentAt: new Date() },
    });
    this.logger.log(`Campaign ${campaignId} sent`);
  }

  private async sendToRecipient(
    campaign: { htmlContent: string; subject: string },
    recipient: {
      id: string;
      subscriberId: string | null;
      trackingToken: string;
      email: string;
    },
  ): Promise<void> {
    try {
      const subscriber = recipient.subscriberId
        ? await this.prisma.newsletterSubscriber.findUnique({
            where: { id: recipient.subscriberId },
          })
        : null;
      const unsubscribeToken =
        subscriber?.unsubscribeToken ?? recipient.trackingToken;

      const html = this.mailer.buildTrackedHtml(campaign.htmlContent, {
        trackingToken: recipient.trackingToken,
        unsubscribeToken,
      });

      await this.mailer.sendCampaignEmail(
        recipient.email,
        campaign.subject,
        html,
      );
      await this.prisma.newsletterCampaignRecipient.update({
        where: { id: recipient.id },
        data: { status: NewsletterRecipientStatus.sent, sentAt: new Date() },
      });
    } catch (err) {
      await this.prisma.newsletterCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: NewsletterRecipientStatus.failed,
          error: (err as Error)?.message ?? 'Unknown error',
        },
      });
    }
  }
}
