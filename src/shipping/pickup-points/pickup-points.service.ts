import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PICKUP_POINT_PROVIDER, PickupPointProvider } from './providers/pickup-point.provider';
import { PickupPoint, PickupPointSearchQuery } from './pickup-point.types';

/** Shape persisted on Order.pickupPointSnapshot — the normalized point plus when it was chosen. */
export interface PickupPointSnapshot extends PickupPoint {
  selectedAt: string;
}

const MAX_SEARCH_RESULTS = 20;

/**
 * Pickup-point lookup scoped to an order.
 *
 * The destination country is always read from the order's own shipping-address
 * snapshot and never accepted from the caller: a customer who edits the country
 * in the browser must not be able to search — or hold onto — a point in a
 * country the order does not ship to. Postcode/city are ordinary search terms
 * and are safe to take from the request.
 */
@Injectable()
export class PickupPointsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PICKUP_POINT_PROVIDER) private readonly provider: PickupPointProvider,
  ) {}

  /**
   * Destination country and carrier filter for an order — both server-derived.
   * The country comes from the order's own address snapshot, and the carrier
   * from the shipping method it currently has selected, so neither can be
   * influenced by the request.
   */
  async searchContextForOrder(orderId: string): Promise<{ country: string; carrierCode: string | null }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { shippingAddressSnapshot: true, shippingMethod: { select: { carrierCode: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const address = order.shippingAddressSnapshot as { country?: string } | null;
    const country = address?.country?.trim();
    if (!country) throw new BadRequestException('Order has no shipping address');

    return { country: country.toUpperCase(), carrierCode: order.shippingMethod?.carrierCode ?? null };
  }

  /** Destination country for an order, upper-cased. Throws when the address isn't set yet. */
  async countryForOrder(orderId: string): Promise<string> {
    return (await this.searchContextForOrder(orderId)).country;
  }

  async searchForOrder(orderId: string, terms: Omit<PickupPointSearchQuery, 'country'>): Promise<PickupPoint[]> {
    const { country, carrierCode } = await this.searchContextForOrder(orderId);
    return this.provider.searchPickupPoints({
      country,
      postcode: terms.postcode,
      city: terms.city,
      address: terms.address,
      // Never taken from the caller — a "Mondial Relay" method must not be
      // able to return a Colissimo point by asking for one.
      carrierCode,
      limit: Math.min(terms.limit ?? 10, MAX_SEARCH_RESULTS),
    });
  }

  /**
   * Re-reads the point from the carrier and confirms it is still selectable
   * for the order's current destination. Returns the snapshot to persist —
   * the carrier's data is the authority for every field, so a client that
   * posts an id it never searched for still gets correct stored details.
   */
  async resolveForOrder(orderId: string, pickupPointId: string): Promise<PickupPointSnapshot> {
    const { country, carrierCode } = await this.searchContextForOrder(orderId);
    const point = await this.provider.validatePickupPoint(country, pickupPointId, carrierCode);
    if (!point) throw new BadRequestException('This pickup point is no longer available');

    // Defence in depth: a provider that ignored the country argument must not
    // be able to attach a foreign point to the order.
    if (point.country.toUpperCase() !== country) {
      throw new BadRequestException('This pickup point is not in the delivery country');
    }
    // Same for the carrier — one account can front several networks.
    if (carrierCode && point.carrierCode && point.carrierCode !== carrierCode) {
      throw new BadRequestException('This pickup point is not served by the selected carrier');
    }

    return { ...point, selectedAt: new Date().toISOString() };
  }

  /** Re-validates an already-stored snapshot, used immediately before payment. */
  async revalidateSnapshot(orderId: string, snapshot: unknown): Promise<PickupPointSnapshot> {
    const stored = snapshot as { id?: string } | null;
    if (!stored?.id) throw new BadRequestException('Please select a pickup point');
    return this.resolveForOrder(orderId, stored.id);
  }
}
