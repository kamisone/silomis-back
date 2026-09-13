import { Module } from '@nestjs/common';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { PersonalizationService } from './personalization.service';
import { PersonalizationController } from './personalization.controller';
import { PersonalizationAdminController } from './personalization-admin.controller';
import { PersonalizationSeedService } from './personalization-seed.service';

@Module({
  imports: [AssetUrlModule],
  controllers: [PersonalizationController, PersonalizationAdminController],
  providers: [PersonalizationService, PersonalizationSeedService],
  exports: [PersonalizationService],
})
export class PersonalizationModule {}
