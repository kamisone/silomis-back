import { Module } from '@nestjs/common';
import { TranslationsModule } from '../translations/translations.module';
import { AiModule } from '../ai/ai.module';
import { CountriesService } from './countries.service';
import {
  CountryPublicController,
  CountryAdminController,
} from './countries.controller';

@Module({
  imports: [TranslationsModule, AiModule],
  controllers: [CountryPublicController, CountryAdminController],
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountriesModule {}
