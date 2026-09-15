import { Module } from '@nestjs/common';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { CommerceEventsModule } from '../commerce-events/commerce-events.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { SendInService } from './send-in.service';
import { SendInSeedService } from './send-in-seed.service';
import { SendInMockupSweepService } from './send-in-mockup-sweep.service';
import { SendInController } from './send-in.controller';
import { SendInAdminController } from './send-in-admin.controller';

@Module({
  imports: [GcsModule, AssetUrlModule, CommerceEventsModule, PersonalizationModule],
  providers: [SendInService, SendInSeedService, SendInMockupSweepService],
  controllers: [SendInController, SendInAdminController],
  exports: [SendInService],
})
export class SendInModule {}
