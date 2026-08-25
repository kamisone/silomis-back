import { Module } from '@nestjs/common';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { TranslationsModule } from '../translations/translations.module';
import { HomeSectionsService } from './home-sections.service';
import { HeroSlidesService } from './hero-slides.service';
import { HomeSectionsAdminController } from './home-sections-admin.controller';
import { HeroSlidesAdminController } from './hero-slides-admin.controller';
import { HomeSectionsPublicController } from './home-sections-public.controller';

@Module({
  imports: [AssetUrlModule, TranslationsModule],
  providers: [HomeSectionsService, HeroSlidesService],
  controllers: [HomeSectionsAdminController, HeroSlidesAdminController, HomeSectionsPublicController],
  exports: [HomeSectionsService, HeroSlidesService],
})
export class HomeSectionsModule {}
