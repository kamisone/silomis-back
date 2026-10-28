import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { StoreBrandsService } from './store-brands.service';

@Public()
@Controller('shop/store-brands')
export class StoreBrandsPublicController {
  constructor(private readonly brands: StoreBrandsService) {}

  @Get(':slug')
  bySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.brands.pageBySlug(slug, lang);
  }
}
