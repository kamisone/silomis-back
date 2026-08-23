import { Controller, Get, Query } from '@nestjs/common';
import { NewsletterAnalyticsService } from './newsletter-analytics.service';

@Controller('admin/newsletter/analytics')
export class NewsletterAnalyticsController {
  constructor(private readonly analytics: NewsletterAnalyticsService) {}

  @Get('overview')
  overview() {
    return this.analytics.overview();
  }

  @Get('growth')
  growth(@Query('days') days?: string) {
    return this.analytics.subscriberGrowth(
      days ? parseInt(days, 10) : undefined,
    );
  }

  @Get('campaigns')
  campaigns(@Query('limit') limit?: string) {
    return this.analytics.campaignPerformance(
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
