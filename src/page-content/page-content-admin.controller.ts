import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { PageContentService, PageContentData } from './page-content.service';

@Controller('admin/content')
export class PageContentAdminController {
  constructor(private readonly service: PageContentService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':slug/:locale')
  findOne(@Param('slug') slug: string, @Param('locale') locale: string) {
    return this.service.findOne(slug, locale);
  }

  @Put(':slug/:locale')
  upsert(
    @Param('slug') slug: string,
    @Param('locale') locale: string,
    @Body() data: PageContentData,
  ) {
    return this.service.upsert(slug, locale, data);
  }
}
