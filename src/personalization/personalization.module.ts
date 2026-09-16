import { Module } from '@nestjs/common';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { GcsModule } from '../gcs/gcs.module';
import { DesignPreviewService } from './design-preview.service';
import { PersonalizationService } from './personalization.service';
import { PersonalizationController } from './personalization.controller';
import { PersonalizationAdminController } from './personalization-admin.controller';
import { PersonalizationSeedService } from './personalization-seed.service';

@Module({
  imports: [AssetUrlModule, GcsModule],
  controllers: [PersonalizationController, PersonalizationAdminController],
  providers: [PersonalizationService, PersonalizationSeedService, DesignPreviewService],
  exports: [PersonalizationService, DesignPreviewService],
})
export class PersonalizationModule {}
