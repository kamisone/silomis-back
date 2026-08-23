import { Module } from '@nestjs/common';
import { PriceRulesModule } from '../price-rules/price-rules.module';
import { PricingEngineService } from './pricing-engine.service';
import { ShopPromotionService } from './shop-promotion.service';
import { PromotionAdminController } from './promotion-admin.controller';
import { PromotionPublicController } from './promotion-public.controller';

@Module({
  imports: [PriceRulesModule],
  providers: [PricingEngineService, ShopPromotionService],
  controllers: [PromotionAdminController, PromotionPublicController],
  exports: [PricingEngineService, ShopPromotionService],
})
export class PromotionsModule {}
