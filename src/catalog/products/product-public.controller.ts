import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ProductsService } from './products.service';
import { RecommendationService } from '../recommendation.service';
import { ReviewsService } from '../../reviews/reviews.service';

@Public()
@Controller('shop/products')
export class ProductPublicController {
  constructor(
    private readonly products: ProductsService,
    private readonly recommendations: RecommendationService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get()
  list(@Query('categoryId') categoryId?: string, @Query('tagId') tagId?: string, @Query('search') search?: string, @Query('featured') featured?: string, @Query('ids') ids?: string, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('lang') lang?: string) {
    return this.products.publicList({
      categoryId,
      tagId,
      search,
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
      ids: ids ? ids.split(',').filter(Boolean) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      lang,
    });
  }

  @Get(':slug/recommendations')
  async getRecommendations(@Param('slug') slug: string, @Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 6;
    const product = await this.products.findBySlug(slug);
    const [frequentlyBoughtTogether, similar] = await Promise.all([this.recommendations.getFrequentlyBoughtTogether(product.id, lim), this.recommendations.getSimilarProducts(product.id, lim)]);
    return { frequentlyBoughtTogether, similar };
  }

  @Get(':slug/reviews')
  async getReviews(@Param('slug') slug: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const product = await this.products.findBySlug(slug);
    return this.reviews.listForProduct(product.id, limit ? parseInt(limit, 10) : undefined, offset ? parseInt(offset, 10) : undefined);
  }

  @Get(':slug/review-stats')
  async getReviewStats(@Param('slug') slug: string) {
    const product = await this.products.findBySlug(slug);
    return this.reviews.getStats(product.id);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.products.findBySlug(slug, lang);
  }
}
