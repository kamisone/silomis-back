import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CollectionsService } from './collections.service';

@Public()
@Controller('shop/collections')
export class CollectionsPublicController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list(@Query('lang') lang?: string) {
    return this.collections.publicList(lang);
  }

  @Get('featured')
  featured(@Query('lang') lang?: string) {
    return this.collections.featuredList(lang);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.collections.findBySlug(slug, lang);
  }
}
