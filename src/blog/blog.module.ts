import { Module } from '@nestjs/common';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { TranslationsModule } from '../translations/translations.module';
import { BlogPostAdminController } from './controllers/blog-post-admin.controller';
import { BlogCategoryAdminController } from './controllers/blog-category-admin.controller';
import { BlogTagAdminController } from './controllers/blog-tag-admin.controller';
import { BlogPublicController } from './controllers/blog-public.controller';
import { BlogPostService } from './services/blog-post.service';
import { BlogCategoryService } from './services/blog-category.service';
import { BlogTagService } from './services/blog-tag.service';
import { BlogSchedulerService } from './services/blog-scheduler.service';

@Module({
  imports: [AssetUrlModule, TranslationsModule],
  controllers: [
    BlogPostAdminController,
    BlogCategoryAdminController,
    BlogTagAdminController,
    BlogPublicController,
  ],
  providers: [
    BlogPostService,
    BlogCategoryService,
    BlogTagService,
    BlogSchedulerService,
  ],
  exports: [BlogPostService, BlogCategoryService, BlogTagService],
})
export class BlogModule {}
