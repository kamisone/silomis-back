import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { GeoIpService } from './geo-ip.service';
import { BehaviorTrackingService } from './behavior-tracking.service';
import { BehaviorTrackingController } from './behavior-tracking.controller';
import { CheckoutStartedListener } from './checkout-started.listener';

@Module({
  imports: [PlatformSettingsModule],
  providers: [GeoIpService, BehaviorTrackingService, CheckoutStartedListener],
  controllers: [BehaviorTrackingController],
  exports: [BehaviorTrackingService, GeoIpService],
})
export class AnalyticsTrackingModule {}
