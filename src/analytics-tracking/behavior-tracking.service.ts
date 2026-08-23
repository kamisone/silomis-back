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
@Injectable()
export class BehaviorTrackingService {
  private readonly logger = new Logger(BehaviorTrackingService.name);

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
}
