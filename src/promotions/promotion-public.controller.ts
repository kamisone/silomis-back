import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ShopPromotionService } from './shop-promotion.service';
import { PricingEngineService } from './pricing-engine.service';

@Public()
@Controller('shop/promotions')
export class PromotionPublicController {
  constructor(
    private readonly promotions: ShopPromotionService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  @Get('active')
  listActive() {
    return this.promotions.listActiveAutoForPublic();
  }

  @Get('for-product')
  forProduct(@Query('productId') productId: string) {
    if (!productId) throw new BadRequestException('productId is required');
    return this.pricingEngine.getActiveForProduct(productId);
  }
}
