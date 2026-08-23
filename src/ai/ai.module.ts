import { Module } from '@nestjs/common';
import { FreeTranslateService } from './free-translate.service';
import { TranslationService } from './translation.service';

@Module({
  providers: [FreeTranslateService, TranslationService],
  exports: [TranslationService],
})
export class AiModule {}
