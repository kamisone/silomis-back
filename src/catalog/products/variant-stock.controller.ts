import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ProductsService } from './products.service';

@Public()
@Controller('shop/variants')
export class VariantStockController {
  constructor(private readonly products: ProductsService) {}

  @Get(':variantId/stock')
  getStock(@Param('variantId') variantId: string) {
    return this.products.getVariantStock(variantId);
  }
}
