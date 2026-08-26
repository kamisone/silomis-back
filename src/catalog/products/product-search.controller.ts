import { Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ProductSearchService } from './product-search.service';

@Public()
@Controller('public/shop/search')
export class ProductSearchPublicController {
  constructor(private readonly searchService: ProductSearchService) {}

  @Get()
  search(
    @Query('q') q: string = '',
    @Query('category') category: string = '',
    @Query('tag') tag: string = '',
    @Query('brand') brand: string = '',
    @Query('minPrice') minPrice: string = '',
    @Query('maxPrice') maxPrice: string = '',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '24',
  ) {
    return this.searchService.search(
      q,
      {
        category: category || undefined,
        tag: tag || undefined,
        brand: brand || undefined,
        minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
        maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
      },
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('autocomplete')
  autocomplete(@Query('q') q: string = '', @Query('limit') limit: string = '12') {
    return this.searchService.autocomplete(q, parseInt(limit, 10));
  }
}

@Controller('admin/shop/search')
export class ProductSearchAdminController {
  constructor(private readonly searchService: ProductSearchService) {}

  @Post('reindex')
  reindexAll() {
    return this.searchService.reindexAll();
  }
}
