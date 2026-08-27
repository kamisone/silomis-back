import { Module } from '@nestjs/common';
import { FreeTranslateService } from './free-translate.service';
import { TranslationService } from './translation.service';
import { TranslateAdminController } from './translate-admin.controller';

@Module({
  controllers: [TranslateAdminController],
  providers: [FreeTranslateService, TranslationService],
  exports: [TranslationService],
})
export class AiModule {}
