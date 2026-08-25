import { Module } from '@nestjs/common';
import { PageContentAdminController } from './page-content-admin.controller';
import { PageContentPublicController } from './page-content-public.controller';
import { PageContentService } from './page-content.service';

@Module({
  controllers: [PageContentAdminController, PageContentPublicController],
  providers: [PageContentService],
})
export class PageContentModule {}
