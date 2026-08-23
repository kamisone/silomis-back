import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RecommendationService } from './recommendation.service';
import { COMMERCE_EVENTS, ProductUpdatedEvent } from '../commerce-events/commerce-events.constants';

/** Evicts cached recommendations for a product whenever it changes. */
@Injectable()
export class RecommendationListener {
  private readonly logger = new Logger(RecommendationListener.name);

  constructor(private readonly recommendations: RecommendationService) {}

  @OnEvent(COMMERCE_EVENTS.PRODUCT_UPDATED)
  async onProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    try {
      await this.recommendations.invalidateProduct(event.productId);
    } catch (err) {
      this.logger.warn(`Recommendation cache invalidation failed for product ${event.productId}: ${(err as Error).message}`);
    }
  }
}
