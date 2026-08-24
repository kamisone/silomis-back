import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DlqModule } from '../../dlq/dlq.module';
import { PlatformSettingsModule } from '../../platform-settings/platform-settings.module';
import { TIKTOK_EVENTS_QUEUE } from './tiktok-events.constants';
import { TikTokEventsOrderListener } from './tiktok-events-order.listener';
import { TikTokEventsProcessor } from './tiktok-events.processor';
import { TikTokEventsService } from './tiktok-events.service';
import { TikTokEventsTrackController } from './tiktok-events-track.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: TIKTOK_EVENTS_QUEUE }),
    DlqModule,
    PlatformSettingsModule,
  ],
  controllers: [TikTokEventsTrackController],
  providers: [
    TikTokEventsOrderListener,
    TikTokEventsProcessor,
    TikTokEventsService,
  ],
  exports: [TikTokEventsService],
})
export class TikTokEventsModule {}
