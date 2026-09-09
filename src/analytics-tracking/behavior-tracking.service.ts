import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { GeoIpService } from './geo-ip.service';
import { BehaviorEventType } from '../../generated/prisma/client';

export interface RecordBehaviorInput {
  eventType: BehaviorEventType;
  cartToken?: string | null;
  shopCustomerId?: string | null;
  productId?: string | null;
  quantity?: number | null;
  searchQuery?: string | null;
  resultCount?: number | null;
  clientIp?: string | null;
  /** Undefined (not passed) = skip the bot check — used by server-authoritative call sites with no request in scope. */
  userAgent?: string;
  device?: string | null;
  source?: string | null;
}

/**
 * The single gate every write path goes through — PlatformSettingsService's
 * IP-exclusion and bot-UA checks are applied here once, not duplicated at
 * each of the 6 call sites (public tracking endpoint, cart add/update/remove,
 * checkout-started, test-checkout-blocked).
 */
/**
 * How long a product's test/live flag is reused before it is re-read.
 *
 * record() runs on every product view, so a lookup per event would double the
 * write path's query count for a value that changes when an admin clicks a
 * toggle. A minute of staleness costs at most a few events landing in the tab
 * the product just left.
 */
const PRODUCT_STATE_TTL_MS = 60_000;

@Injectable()
export class BehaviorTrackingService {
  private readonly logger = new Logger(BehaviorTrackingService.name);
  private readonly productState = new Map<string, { isTest: boolean; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly geoIp: GeoIpService,
  ) {}

  async record(input: RecordBehaviorInput): Promise<void> {
    try {
      if (this.platformSettings.isAnalyticsExcluded(input.clientIp)) return;
      if (input.userAgent !== undefined && this.platformSettings.isBotUserAgent(input.userAgent)) return;

      await this.prisma.shopBehaviorEvent.create({
        data: {
          eventType: input.eventType,
          cartToken: input.cartToken ?? null,
          shopCustomerId: input.shopCustomerId ?? null,
          productId: input.productId ?? null,
          productIsTest: await this.isTestProduct(input.productId),
          quantity: input.quantity ?? null,
          searchQuery: input.searchQuery ?? null,
          resultCount: input.resultCount ?? null,
          visitorHash: this.geoIp.visitorHash(input.clientIp),
          countryCode: this.geoIp.countryFromIp(input.clientIp),
          clientIp: input.clientIp ?? null,
          device: input.device ?? null,
          source: input.source ?? null,
        },
      });
    } catch (err) {
      // Never let analytics capture break the caller's real action (add-to-cart, checkout, ...).
      this.logger.warn(`Behavior event write failed (${input.eventType}): ${(err as Error).message}`);
    }
  }

  /**
   * The product's test/live state, snapshotted onto the event.
   *
   * Read here rather than passed in by callers: this is the single gate every
   * write path goes through, and six call sites each remembering to look it up
   * is six chances to forget. Null for a cart-level event with no product.
   *
   * Never throws. A failed lookup costs this event its phase — it lands in
   * neither tab — but the event itself is still written; losing a view because
   * the product table hiccuped would be the worse trade.
   */
  private async isTestProduct(productId: string | null | undefined): Promise<boolean | null> {
    if (!productId) return null;

    const cached = this.productState.get(productId);
    if (cached && cached.expiresAt > Date.now()) return cached.isTest;

    try {
      const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { isTestProduct: true } });
      if (!product) return null;

      this.productState.set(productId, { isTest: product.isTestProduct, expiresAt: Date.now() + PRODUCT_STATE_TTL_MS });
      return product.isTestProduct;
    } catch (err) {
      this.logger.warn(`Could not resolve product phase for ${productId}: ${(err as Error).message}`);
      return null;
    }
  }
}
