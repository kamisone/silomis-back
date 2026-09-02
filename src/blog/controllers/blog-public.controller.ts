import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { BlogPostService } from '../services/blog-post.service';
import { BlogCategoryService } from '../services/blog-category.service';
import { BlogTagService } from '../services/blog-tag.service';

@Public()
@Controller('blog')
export class BlogPublicController {
  constructor(
    private readonly posts: BlogPostService,
    private readonly categories: BlogCategoryService,
    private readonly tags: BlogTagService,
  ) {}

  @Get('posts')
  list(
    @Query('categoryId') categoryId?: string,
    @Query('tagId') tagId?: string,
    @Query('search') search?: string,
    @Query('featured') featured?: string,
    @Query('productId') productId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('lang') lang?: string,
  ) {
    return this.posts.publicList({
      categoryId,
      tagId,
      search,
      featured: featured === 'true' ? true : undefined,
      productId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      lang,
    });
  }

  @Get('posts/slug/:slug')
  getBySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.posts.publicFindBySlug(slug, lang);
  }

  @Get('posts/:id/related')
  related(@Param('id') id: string) {
    return this.posts.publicRelated(id);
  }

  @Get('categories')
  listCategories(@Query('lang') lang?: string) {
    return this.categories.findAll(true, lang);
  }

  @Get('tags')
  listTags() {
    return this.tags.findAll();
  }
}
