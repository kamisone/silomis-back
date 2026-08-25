import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ProductsService } from './products.service';
import { RecommendationService } from '../recommendation.service';
import { ReviewsService } from '../../reviews/reviews.service';
import { PRODUCT_SORTS, type ProductSort } from './dto/product.dto';

@Public()
@Controller('shop/products')
export class ProductPublicController {
  constructor(
    private readonly products: ProductsService,
    private readonly recommendations: RecommendationService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get()
  list(
    @Query('categoryId') categoryId?: string,
    @Query('tagId') tagId?: string,
    @Query('collection') collection?: string,
    @Query('search') search?: string,
    @Query('featured') featured?: string,
    @Query('ids') ids?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('lang') lang?: string,
  ) {
    return this.products.publicList({
      categoryId,
      tagId,
      collection,
      search,
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
      ids: ids ? ids.split(',').filter(Boolean) : undefined,
      // Unrecognized values fall through as undefined rather than 400 — a
      // stale bookmark with ?sort=whatever should still render the listing.
      sort: (PRODUCT_SORTS as readonly string[]).includes(sort ?? '') ? (sort as ProductSort) : undefined,
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

  /** Resolve a set of selected option value IDs to a specific SKU/variant. */
  @Post(':slug/variants/resolve')
  @HttpCode(200)
  async resolveVariant(@Param('slug') slug: string, @Body() dto: { optionValueIds: string[]; lang?: string }) {
    const product = await this.products.findBySlug(slug);
    return this.products.resolveVariant(product.id as string, dto.optionValueIds ?? [], dto.lang);
  }

  /**
   * Returns all variants with stock levels and option combinations.
   * Used by the PDP option picker to disable unavailable choices.
   */
  @Get(':slug/variants/availability')
  async getAvailabilityMatrix(@Param('slug') slug: string, @Query('lang') lang?: string) {
    const product = await this.products.findBySlug(slug);
    return this.products.getVariantAvailabilityMatrix(product.id as string, lang);
  }

  /** Fetch a specific variant by its URL slug (e.g. /products/tshirt/variants/black-m). */
  @Get(':slug/variants/:variantSlug')
  async getVariantBySlug(@Param('slug') slug: string, @Param('variantSlug') variantSlug: string) {
    const product = await this.products.findBySlug(slug);
    return this.products.getVariantBySlug(product.id as string, variantSlug);
  }
}
