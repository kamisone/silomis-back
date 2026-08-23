import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AntiSpamModule } from '../common/anti-spam/anti-spam.module';
import { EmailModule } from '../email/email.module';
import { DlqModule } from '../dlq/dlq.module';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { NewsletterAdminController } from './newsletter-admin.controller';
import { NewsletterCampaignsController } from './newsletter-campaigns.controller';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import { NewsletterAnalyticsController } from './newsletter-analytics.controller';
import { NewsletterAnalyticsService } from './newsletter-analytics.service';
import { NewsletterSegmentationService } from './newsletter-segmentation.service';
import { NewsletterMailerService } from './newsletter-mailer.service';
import { NewsletterCampaignProcessor } from './newsletter-campaign.processor';
import { NEWSLETTER_CAMPAIGN_QUEUE } from './newsletter.constants';

@Module({
  imports: [
    AntiSpamModule,
    EmailModule,
    DlqModule,
    BullModule.registerQueue({ name: NEWSLETTER_CAMPAIGN_QUEUE }),
  ],
  controllers: [
    NewsletterController,
    NewsletterAdminController,
    NewsletterCampaignsController,
    NewsletterAnalyticsController,
  ],
  providers: [
    NewsletterService,
    NewsletterCampaignsService,
    NewsletterAnalyticsService,
    NewsletterSegmentationService,
    NewsletterMailerService,
    NewsletterCampaignProcessor,
  ],
})
export class NewsletterModule {}
