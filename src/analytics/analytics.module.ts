import { Module } from '@nestjs/common';
import { ShopAnalyticsService } from './shop-analytics.service';
import { ShopAnalyticsAggregatorService } from './shop-analytics-aggregator.service';
import { ShopBehaviorAnalyticsService } from './shop-behavior-analytics.service';
import { ShopAnalyticsController } from './shop-analytics.controller';

@Module({
  providers: [ShopAnalyticsService, ShopAnalyticsAggregatorService, ShopBehaviorAnalyticsService],
  controllers: [ShopAnalyticsController],
  exports: [ShopBehaviorAnalyticsService],
})
export class AnalyticsModule {}
