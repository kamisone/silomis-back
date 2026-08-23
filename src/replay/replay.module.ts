import { Module } from '@nestjs/common';
import { GcsModule } from '../gcs/gcs.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { AnalyticsTrackingModule } from '../analytics-tracking/analytics-tracking.module';
import { ReplayTrackingService } from './replay-tracking.service';
import { ReplayTrackingController } from './replay-tracking.controller';
import { ReplayAdminService } from './replay-admin.service';
import { ReplayAdminController } from './replay-admin.controller';
import { ReplayAnalyticsController } from './replay-analytics.controller';
import { ReplayRetentionService } from './replay-retention.service';

@Module({
  imports: [GcsModule, PlatformSettingsModule, AnalyticsTrackingModule],
  providers: [ReplayTrackingService, ReplayAdminService, ReplayRetentionService],
  controllers: [ReplayTrackingController, ReplayAdminController, ReplayAnalyticsController],
})
export class ReplayModule {}
