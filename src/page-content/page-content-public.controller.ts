import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PageContentService } from './page-content.service';

@Public()
@Controller('content')
export class PageContentPublicController {
  constructor(private readonly service: PageContentService) {}

  @Get(':slug')
  getPublic(@Param('slug') slug: string, @Query('locale') locale = 'en') {
    return this.service.findOne(slug, locale);
  }
}
