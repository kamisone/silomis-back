import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductSearchService } from './product-search.service';
import { COMMERCE_EVENTS, ProductUpdatedEvent } from '../../commerce-events/commerce-events.constants';

/**
 * Keeps the (optional) Meilisearch index in sync whenever a product changes —
 * a no-op when Meilisearch isn't configured, since indexProduct/removeFromIndex
 * both bail out immediately in that case.
 */
@Injectable()
export class SearchIndexListener {
  private readonly logger = new Logger(SearchIndexListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: ProductSearchService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.PRODUCT_UPDATED)
  async onProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    if (!this.searchService.isEnabled) return;
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: event.productId },
        include: { categories: { select: { id: true, name: true } }, tags: { select: { id: true, name: true } } },
      });
      if (!product || product.deletedAt || product.status !== 'active') {
        await this.searchService.removeFromIndex(event.productId);
        return;
      }
      await this.searchService.indexProduct(product);
    } catch (err) {
      this.logger.warn(`Search index sync failed for product ${event.productId}: ${(err as Error).message}`);
    }
  }
}
