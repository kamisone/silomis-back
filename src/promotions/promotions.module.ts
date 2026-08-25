import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TranslationsModule } from '../translations/translations.module';
import { PriceRulesModule } from '../price-rules/price-rules.module';
import { PricingEngineService } from './pricing-engine.service';
import { ShopPromotionService } from './shop-promotion.service';
import { PromotionAdminController } from './promotion-admin.controller';
import { PromotionPublicController } from './promotion-public.controller';

@Module({
  imports: [PriceRulesModule, AiModule, TranslationsModule],
  providers: [PricingEngineService, ShopPromotionService],
  controllers: [PromotionAdminController, PromotionPublicController],
  exports: [PricingEngineService, ShopPromotionService],
})
export class PromotionsModule {}
