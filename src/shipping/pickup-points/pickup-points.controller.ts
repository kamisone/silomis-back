import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PickupPointsService } from './pickup-points.service';
import { PickupPointLocalitiesService } from './pickup-point-localities.service';
import { SearchPickupPointsDto, SearchPickupPointsSchema, SuggestLocalitiesDto, SuggestLocalitiesSchema } from './dto/pickup-point.dto';

/**
 * Storefront-facing pickup-point search. Public like the rest of the checkout
 * ingest routes — the caller is a shopper, not an admin — and carrier
 * credentials stay server-side: the browser only ever talks to this endpoint.
 */
@Public()
@Controller('public/shop/shipping/pickup-points')
export class PickupPointsPublicController {
  constructor(
    private readonly pickupPoints: PickupPointsService,
    private readonly localities: PickupPointLocalitiesService,
  ) {}

  /**
   * Type-ahead localities. Served from a cached index rather than the carrier,
   * so it is cheap enough to call on every keystroke — country and carrier are
   * still derived from the order, never from the request.
   */
  @Get('localities')
  async suggestLocalities(@Query(new ZodValidationPipe(SuggestLocalitiesSchema)) query: SuggestLocalitiesDto) {
    const { country, carrierCode } = await this.pickupPoints.searchContextForOrder(query.orderId);
    return this.localities.suggest(country, carrierCode, query.q);
  }

  @Get()
  search(@Query(new ZodValidationPipe(SearchPickupPointsSchema)) query: SearchPickupPointsDto) {
    return this.pickupPoints.searchForOrder(query.orderId, {
      postcode: query.postcode,
      city: query.city,
      address: query.address,
      limit: query.limit,
    });
  }
}
