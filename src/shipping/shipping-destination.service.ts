import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeoIpService } from '../analytics-tracking/geo-ip.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { FreeShippingOptions, QuotedMethod, ShippingService } from './shipping.service';

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
  /**
   * The embroidery production days already in `deliveryDaysMax` — so a page
   * selling something that is not embroidered (the neutral header) can take
   * them back out.
   */
  productionDays: number | null;
}

/**
 * The product page's "Delivery details": what the checkout's delivery step
 * would offer for this product alone — options only, never zones or settings.
 * `country` set means `methods` holds that country's options; null means the
 * shop does not (knowingly) ship there, and `methods` holds every option any
 * shipping country is offered, each once.
 */
export interface ProductDeliveryOptions {
  country: string | null;
  freeShipping: boolean;
  methods: QuotedMethod[];
}

const NONE: ShippingDestination = { country: null, deliveryDaysMin: null, deliveryDaysMax: null, productionDays: null };

const ISO_ALPHA2 = /^[A-Z]{2}$/;

/** How long a country's answer is reused. Admin edits to zones, methods or the country list show within this. */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedWindow {
  at: number;
  /** null = the shop does not deliver to this country. */
  window: { min: number; max: number; production: number } | null;
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

  /**
   * Delivery options for one product, quoted exactly as checkout quotes them
   * (same zones, opt-in methods, free shipping with its paid upgrades, zone
   * surcharges and free-above thresholds) for a basket of just this product
   * at `subtotalCents`. Basket-wide promotions are not known here.
   *
   * The country is the visitor's checkout choice, else their IP's — and only
   * when it is active, shipping-enabled and quoted at least one method, the
   * same rule as the header strip. Otherwise every zone is listed.
   */
  async productOptions(productId: string, ip: string | null, hint: string | null | undefined, subtotalCents: number, lang?: string): Promise<ProductDeliveryOptions> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        freeShipping: true,
        freeShippingDaysMin: true,
        freeShippingDaysMax: true,
        freeShippingUpgradeMethods: { select: { id: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    // CheckoutService.resolveShippingContext for a one-product basket.
    const opts: FreeShippingOptions = product.freeShipping
      ? {
          forceFree: true,
          upgradeMethodIds: product.freeShippingUpgradeMethods.map((m) => m.id),
          freeDaysMin: product.freeShippingDaysMin,
          freeDaysMax: product.freeShippingDaysMax,
          productIds: [productId],
        }
      : { productIds: [productId] };

    const candidates = [normaliseCode(hint), normaliseCode(this.geo.countryFromIp(ip))].filter((c): c is string => !!c);
    for (const code of new Set(candidates)) {
      const country = await this.prisma.country.findUnique({ where: { isoCode: code }, select: { isActive: true, isShippingEnabled: true } });
      if (!country?.isActive || !country.isShippingEnabled) continue;
      const quote = await this.shipping.getMethodsForCountry(code, subtotalCents, lang, opts);
      if (quote.methods.length) return { country: code, freeShipping: product.freeShipping, methods: quote.methods };
    }

    return { country: null, freeShipping: product.freeShipping, methods: await this.allMethods(subtotalCents, lang, opts) };
  }

  /**
   * Every option checkout would offer in at least one shipping country, each
   * once, cheapest first. A method belongs to one zone, so it has one price
   * wherever it is offered. Countries served by the same zones get the same
   * quote, so it is computed once per zone set rather than once per country.
   */
  private async allMethods(subtotalCents: number, lang: string | undefined, opts: FreeShippingOptions): Promise<QuotedMethod[]> {
    const [countries, zones] = await Promise.all([
      this.prisma.country.findMany({ where: { isActive: true, isShippingEnabled: true }, select: { isoCode: true } }),
      this.shipping.listActiveZones(),
    ]);
    // resolveZonesForCountry's order: zones naming the country (oldest first), then catch-alls.
    const catchAll = zones.filter((z) => !z.countryCodes.length);
    const zoneSets = new Map<string, typeof zones>();
    for (const { isoCode } of countries) {
      const serving = [...zones.filter((z) => z.countryCodes.includes(isoCode)), ...catchAll];
      if (serving.length) zoneSets.set(serving.map((z) => z.id).join(','), serving);
    }

    const byId = new Map<string, QuotedMethod>();
    for (const serving of zoneSets.values()) {
      const quote = await this.shipping.quoteZones(serving, subtotalCents, lang, opts);
      for (const m of quote.methods) if (!byId.has(m.id)) byId.set(m.id, m);
    }
    return [...byId.values()].sort((a, b) => a.priceCents - b.priceCents);
  }

  private async forCountry(code: string): Promise<ShippingDestination> {
    const window = await this.deliveryWindow(code);
    if (!window) return NONE;
    return { country: code, deliveryDaysMin: window.min, deliveryDaysMax: window.max, productionDays: window.production };
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
  private async deliveryWindow(code: string): Promise<{ min: number; max: number; production: number } | null> {
    const hit = this.cache.get(code);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.window;

    const window = await this.computeWindow(code);
    this.cache.set(code, { at: Date.now(), window });
    return window;
  }

  private async computeWindow(code: string): Promise<{ min: number; max: number; production: number } | null> {
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
    const production = Math.max(0, this.settings.getEmbroideryConfig().productionDays);
    const max = Math.max(min, first.estimatedDaysMax) + production;
    // A zero-day window is a misconfigured method, not a promise to repeat.
    if (max < 1) return null;
    return { min: Math.max(1, min), max, production };
  }
}

function normaliseCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && ISO_ALPHA2.test(code) ? code : null;
}
