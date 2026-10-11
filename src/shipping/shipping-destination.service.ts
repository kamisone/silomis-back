import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeoIpService } from '../analytics-tracking/geo-ip.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { ShippingService } from './shipping.service';

/**
 * What the header's shipping strip may say to this visitor.
 *
 * `country` is set only when the shop really delivers there; null means the
 * strip keeps its generic wording. Delivery days are business days, counted
 * the same way checkout counts them.
 */
export interface ShippingDestination {
  country: string | null;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
}

const NONE: ShippingDestination = { country: null, deliveryDaysMin: null, deliveryDaysMax: null };

const ISO_ALPHA2 = /^[A-Z]{2}$/;

/** How long a country's answer is reused. Admin edits to zones, methods or the country list show within this. */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedWindow {
  at: number;
  /** null = the shop does not deliver to this country. */
  window: { min: number; max: number } | null;
}

@Injectable()
export class ShippingDestinationService {
  private readonly cache = new Map<string, CachedWindow>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shipping: ShippingService,
    private readonly geo: GeoIpService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * The visitor's destination: the country they already chose at checkout
   * (`hint`) when that is one the shop delivers to, otherwise their IP's
   * country. A hint the shop cannot serve falls through to the IP rather than
   * hiding the strip, since a stale hint is not proof of anything.
   */
  async resolve(ip: string | null, hint?: string | null): Promise<ShippingDestination> {
    const hinted = normaliseCode(hint);
    if (hinted) {
      const fromHint = await this.forCountry(hinted);
      if (fromHint.country) return fromHint;
    }

    const fromIp = normaliseCode(this.geo.countryFromIp(ip));
    if (!fromIp || fromIp === hinted) return NONE;
    return this.forCountry(fromIp);
  }

  private async forCountry(code: string): Promise<ShippingDestination> {
    const window = await this.deliveryWindow(code);
    if (!window) return NONE;
    return { country: code, deliveryDaysMin: window.min, deliveryDaysMax: window.max };
  }

  /**
   * Business days to delivery in `code`, or null when the shop does not
   * deliver there.
   *
   * "Delivers there" is exactly what checkout would allow: the country is
   * active and shipping-enabled in the admin's country list, AND a quote for it
   * has at least one method. Either alone over-claims — the flag says nothing
   * about zones, and a catch-all zone quotes every country on earth.
   *
   * The window is the default method's (the one checkout preselects), with the
   * embroidery production time added to the upper bound only: a plain item
   * ships straight away, an embroidered one waits for production, and the
   * strip cannot know which the visitor will buy. The range stays true for both.
   */
  private async deliveryWindow(code: string): Promise<{ min: number; max: number } | null> {
    const hit = this.cache.get(code);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.window;

    const window = await this.computeWindow(code);
    this.cache.set(code, { at: Date.now(), window });
    return window;
  }

  private async computeWindow(code: string): Promise<{ min: number; max: number } | null> {
    const country = await this.prisma.country.findUnique({
      where: { isoCode: code },
      select: { isActive: true, isShippingEnabled: true },
    });
    if (!country?.isActive || !country.isShippingEnabled) return null;

    // No basket: opt-in methods (pickup points) are left out, as they would
    // be for a customer whose products have not opted in.
    const quote = await this.shipping.getMethodsForCountry(code, 0);
    const first = quote.methods[0];
    if (!first) return null;

    const min = Math.max(0, first.estimatedDaysMin);
    const production = this.settings.getEmbroideryConfig().productionDays;
    const max = Math.max(min, first.estimatedDaysMax) + Math.max(0, production);
    // A zero-day window is a misconfigured method, not a promise to repeat.
    if (max < 1) return null;
    return { min: Math.max(1, min), max };
  }
}

function normaliseCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && ISO_ALPHA2.test(code) ? code : null;
}
