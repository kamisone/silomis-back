import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationsService } from '../translations/translations.service';
import { UpdateMethodDto, UpdateZoneDto, UpsertMethodDto, UpsertZoneDto } from './dto/shipping.dto';
import { ShippingMethod, ShippingZone } from '../../generated/prisma/client';

const ET_SHIPPING_METHOD = 'shop_shipping_method';

/** Synthetic id for the free-shipping option injected into a quote — not a real ShippingMethod row. */
export const FREE_SHIPPING_METHOD_ID = '00000000-0000-0000-0000-000000000000';

/** Stable code for the Mondial Relay pickup-point method. Nothing branches on it; it exists so the seed is idempotent. */
export const MONDIAL_RELAY_METHOD_CODE = 'mondial_relay';

/**
 * Starting country list for the seeded Mondial Relay method — the core Point
 * Relais markets. Deliberately narrow and admin-editable: which countries a
 * given account can actually ship to depends on its Mondial Relay contract,
 * so this is a safe default to widen, not an authoritative list.
 */
const MONDIAL_RELAY_DEFAULT_COUNTRIES = ['FR', 'BE', 'LU', 'ES', 'PT', 'NL'];

export interface QuotedMethod {
  id: string;
  /** Stable internal code, or null for an ordinary admin-created method. */
  code: string | null;
  name: string;
  description: string | null;
  carrier: string | null;
  priceCents: number;
  originalPriceCents: number;
  isFree: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  /** The customer must choose a pickup point before this method can be paid for. */
  requiresPickupPoint: boolean;
}

export interface ShippingQuote {
  zone: ShippingZone | null;
  methods: QuotedMethod[];
}

export interface FreeShippingOptions {
  forceFree?: boolean;
  /** ShippingMethod ids the product(s) in the order allow as a paid upgrade alongside free shipping */
  upgradeMethodIds?: string[];
  freeDaysMin?: number | null;
  freeDaysMax?: number | null;
  /**
   * Distinct products being shipped. Methods with requiresProductOptIn are
   * quoted only when every one of them opted in, so an absent/empty list
   * means such a method is not offered — a quote with no cart context (the
   * public methods endpoint) can't prove the all-or-nothing rule holds.
   */
  productIds?: string[];
}

@Injectable()
export class ShippingService implements OnModuleInit {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
    await this.seedMondialRelay();
  }

  /** Idempotent: only runs when no zone exists yet, matching vitecamio's install-time seed. */
  private async seed(): Promise<void> {
    const count = await this.prisma.shippingZone.count();
    if (count > 0) return;

    const worldwide = await this.prisma.shippingZone.create({
      data: { name: 'Worldwide', countryCodes: [], isActive: true, surchargeCents: 0, estimatedDeliveryDays: '3-7 business days' },
    });
    await this.prisma.shippingMethod.createMany({
      data: [
        { zoneId: worldwide.id, name: 'Standard Shipping', priceCents: 500, freeAboveCents: 5000, estimatedDaysMin: 3, estimatedDaysMax: 7, sortOrder: 0 },
        { zoneId: worldwide.id, name: 'Express Shipping', priceCents: 1200, freeAboveCents: null, estimatedDaysMin: 1, estimatedDaysMax: 3, sortOrder: 1 },
      ],
    });
    this.logger.log('Shipping zones seeded (Worldwide: Standard + Express)');
  }

  /**
   * Ensures the Mondial Relay method row exists so the rest of the system has
   * a stable `code` to reference across environments.
   *
   * Runs on every boot but only ever creates: an existing row is left exactly
   * as the admin configured it (price, countries, active state all editable in
   * Shop → Shipping). Seeded INACTIVE on purpose — it needs carrier
   * credentials and per-product opt-in before it can serve a real order, so
   * switching it on is a deliberate admin action rather than a side effect of
   * deploying this code.
   */
  private async seedMondialRelay(): Promise<void> {
    const existing = await this.prisma.shippingMethod.findUnique({ where: { code: MONDIAL_RELAY_METHOD_CODE } });
    if (existing) {
      // One-time repair: rows seeded before `carrierCode` existed have none, and
      // an unset filter would let a Mondial Relay method offer another
      // network's points. Only fills a NULL — an admin's own value is kept.
      if (existing.carrierCode === null) {
        await this.prisma.shippingMethod.update({ where: { id: existing.id }, data: { carrierCode: 'mondial_relay' } });
        this.logger.log(`Backfilled carrierCode on "${MONDIAL_RELAY_METHOD_CODE}"`);
      }
      return;
    }

    // Attach to the worldwide fallback when present, else any active zone —
    // supportedCountryCodes is what actually scopes this method, not the zone.
    const zone =
      (await this.prisma.shippingZone.findFirst({ where: { isActive: true, countryCodes: { equals: [] } } })) ??
      (await this.prisma.shippingZone.findFirst({ where: { isActive: true } }));
    if (!zone) return;

    await this.prisma.shippingMethod.create({
      data: {
        zoneId: zone.id,
        code: MONDIAL_RELAY_METHOD_CODE,
        name: 'Mondial Relay — Point Relais',
        carrier: 'Mondial Relay',
        // Filters the pickup-point provider: one Sendcloud account fronts
        // several networks, so this method must only ever offer MR points.
        carrierCode: 'mondial_relay',
        description: 'Delivery to a Mondial Relay pickup point or locker of your choice.',
        priceCents: 490,
        estimatedDaysMin: 3,
        estimatedDaysMax: 5,
        isActive: false,
        sortOrder: 10,
        requiresProductOptIn: true,
        requiresPickupPoint: true,
        supportedCountryCodes: MONDIAL_RELAY_DEFAULT_COUNTRIES,
      },
    });
    this.logger.log(`Seeded shipping method "${MONDIAL_RELAY_METHOD_CODE}" (inactive — enable it in Shop → Shipping)`);
  }

  // ── Quoting ──────────────────────────────────────────────────────────────

  async resolveZoneForCountry(countryCode: string): Promise<ShippingZone | null> {
    const zones = await this.prisma.shippingZone.findMany({ where: { isActive: true, countryCodes: { has: countryCode } } });
    if (zones.length) return zones[0];
    return this.prisma.shippingZone.findFirst({ where: { isActive: true, countryCodes: { equals: [] } } });
  }

  async getMethodsForCountry(countryCode: string, cartTotalCents: number, lang?: string, opts: FreeShippingOptions = {}): Promise<ShippingQuote> {
    const zone = await this.resolveZoneForCountry(countryCode);
    if (!zone) return { zone: null, methods: [] };

    const allMethods = await this.prisma.shippingMethod.findMany({ where: { zoneId: zone.id, isActive: true }, orderBy: { sortOrder: 'asc' } });
    const eligible = await this.filterEligible(allMethods, countryCode, opts.productIds ?? []);
    const translated = (await this.translations.maybeApply(eligible, ET_SHIPPING_METHOD, lang)) as ShippingMethod[];

    if (opts.forceFree) {
      return { zone, methods: this.buildFreeShippingOptions(zone, translated, cartTotalCents, opts) };
    }

    return { zone, methods: this.applyZonePricing(zone, translated, cartTotalCents) };
  }

  /**
   * Narrows a zone's methods to those actually offerable for this destination
   * and this basket. Two independent gates, both fail-closed:
   *
   * - `supportedCountryCodes` narrows a method below its zone (a carrier may
   *   serve only part of a zone). Empty means "the whole zone", which is how
   *   every method behaved before the column existed.
   * - `requiresProductOptIn` enforces the all-or-nothing product rule: the
   *   method is offered only if every distinct product being shipped is linked
   *   to it. One product without the link removes the method for the whole
   *   basket, and an unknown basket removes it too.
   *
   * Quantities are irrelevant here — eligibility is a property of the product,
   * so ten units of an opted-in product is still one opted-in product. Callers
   * pass distinct product ids.
   */
  private async filterEligible(methods: ShippingMethod[], countryCode: string, productIds: string[]): Promise<ShippingMethod[]> {
    const country = countryCode.toUpperCase();
    const servesCountry = methods.filter((m) => m.supportedCountryCodes.length === 0 || m.supportedCountryCodes.includes(country));

    const optIn = servesCountry.filter((m) => m.requiresProductOptIn);
    if (!optIn.length) return servesCountry;

    // No basket context: an opt-in method can't be proven eligible, so it is
    // not offered. Applies to the public quote endpoint, which has no cart.
    if (!productIds.length) return servesCountry.filter((m) => !m.requiresProductOptIn);

    const allowedIds = await this.methodIdsEveryProductAllows(
      optIn.map((m) => m.id),
      productIds,
    );
    return servesCountry.filter((m) => !m.requiresProductOptIn || allowedIds.has(m.id));
  }

  /**
   * Of `methodIds`, those linked to every one of `productIds`. Counts opt-in
   * rows per method in one grouped query rather than loading each product's
   * method list, so a large basket stays a single round trip.
   */
  private async methodIdsEveryProductAllows(methodIds: string[], productIds: string[]): Promise<Set<string>> {
    if (!methodIds.length) return new Set();

    const rows = await this.prisma.shippingMethod.findMany({
      where: { id: { in: methodIds } },
      select: { id: true, _count: { select: { eligibleProducts: { where: { id: { in: productIds } } } } } },
    });
    return new Set(rows.filter((r) => r._count.eligibleProducts === productIds.length).map((r) => r.id));
  }

  private applyZonePricing(zone: ShippingZone, methods: ShippingMethod[], cartTotalCents: number): QuotedMethod[] {
    const quotable = methods.filter((m) => !m.availableForFreeShipping);
    const pool = quotable.length ? quotable : methods;
    if (!quotable.length && methods.length) {
      this.logger.warn(`Zone ${zone.id} has no ordinary methods once free-shipping-only methods are excluded — falling back to all methods`);
    }

    const zoneFree = zone.freeShippingThresholdCents !== null && cartTotalCents >= zone.freeShippingThresholdCents;

    return pool.map((m) => {
      const methodFree = m.freeAboveCents !== null && cartTotalCents >= m.freeAboveCents;
      const isFree = zoneFree || methodFree;
      const originalPriceCents = m.priceCents + zone.surchargeCents;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        carrier: m.carrier,
        priceCents: isFree ? 0 : originalPriceCents,
        originalPriceCents,
        isFree,
        estimatedDaysMin: m.estimatedDaysMin,
        estimatedDaysMax: m.estimatedDaysMax,
        requiresPickupPoint: m.requiresPickupPoint,
      };
    });
  }

  private buildFreeShippingOptions(zone: ShippingZone, methods: ShippingMethod[], cartTotalCents: number, opts: FreeShippingOptions): QuotedMethod[] {
    const upgrades = methods.filter((m) => m.availableForFreeShipping && opts.upgradeMethodIds?.includes(m.id));
    const nonUpgrade = methods.filter((m) => !m.availableForFreeShipping);
    const source = nonUpgrade[0] ?? methods[methods.length - 1] ?? null;

    const freeOption: QuotedMethod = {
      id: FREE_SHIPPING_METHOD_ID,
      code: null,
      name: 'Free shipping',
      description: null,
      carrier: null,
      priceCents: 0,
      originalPriceCents: 0,
      isFree: true,
      estimatedDaysMin: opts.freeDaysMin ?? source?.estimatedDaysMin ?? 3,
      estimatedDaysMax: opts.freeDaysMax ?? source?.estimatedDaysMax ?? 7,
      // The synthetic free option is never a pickup-point method: it stands in
      // for the zone's ordinary delivery, not for a specific carrier product.
      requiresPickupPoint: false,
    };

    const upgradeOptions: QuotedMethod[] = upgrades.map((m) => {
      const originalPriceCents = m.priceCents + zone.surchargeCents;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        carrier: m.carrier,
        priceCents: originalPriceCents,
        originalPriceCents,
        isFree: false,
        estimatedDaysMin: m.estimatedDaysMin,
        estimatedDaysMax: m.estimatedDaysMax,
        requiresPickupPoint: m.requiresPickupPoint,
      };
    });

    return [freeOption, ...upgradeOptions];
  }

  async getOverview(lang?: string): Promise<{ zone: ShippingZone; methods: ShippingMethod[] }[]> {
    const zones = await this.prisma.shippingZone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const out: { zone: ShippingZone; methods: ShippingMethod[] }[] = [];
    for (const zone of zones) {
      const methods = await this.prisma.shippingMethod.findMany({ where: { zoneId: zone.id, isActive: true, availableForFreeShipping: false }, orderBy: { sortOrder: 'asc' } });
      const translated = (await this.translations.maybeApply(methods, ET_SHIPPING_METHOD, lang)) as ShippingMethod[];
      out.push({ zone, methods: translated });
    }
    return out;
  }

  // ── Admin: zones ─────────────────────────────────────────────────────────

  listZones(): Promise<ShippingZone[]> {
    return this.prisma.shippingZone.findMany({ orderBy: { name: 'asc' } });
  }

  createZone(dto: UpsertZoneDto): Promise<ShippingZone> {
    return this.prisma.shippingZone.create({ data: dto });
  }

  async updateZone(id: string, dto: UpdateZoneDto): Promise<ShippingZone> {
    await this.assertZoneExists(id);
    return this.prisma.shippingZone.update({ where: { id }, data: dto });
  }

  async deleteZone(id: string): Promise<void> {
    await this.assertZoneExists(id);
    await this.prisma.shippingZone.delete({ where: { id } });
  }

  private async assertZoneExists(id: string): Promise<void> {
    const zone = await this.prisma.shippingZone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Shipping zone not found');
  }

  // ── Admin: methods ───────────────────────────────────────────────────────

  listMethods(zoneId?: string): Promise<ShippingMethod[]> {
    return this.prisma.shippingMethod.findMany({ where: zoneId ? { zoneId } : undefined, orderBy: { sortOrder: 'asc' } });
  }

  /**
   * Methods an admin must enable per product (see Product.shippingMethods) —
   * the checkbox list on the product form. Inactive methods are included so a
   * temporarily disabled carrier doesn't silently drop its product links.
   */
  listProductOptInMethods(): Promise<(ShippingMethod & { zone: ShippingZone })[]> {
    return this.prisma.shippingMethod.findMany({
      where: { requiresProductOptIn: true },
      include: { zone: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  listFreeShippingUpgradeMethods(): Promise<(ShippingMethod & { zone: ShippingZone })[]> {
    return this.prisma.shippingMethod.findMany({
      where: { availableForFreeShipping: true, isActive: true },
      include: { zone: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  createMethod(dto: UpsertMethodDto): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.create({ data: dto });
  }

  async updateMethod(id: string, dto: UpdateMethodDto): Promise<ShippingMethod> {
    await this.assertMethodExists(id);
    return this.prisma.shippingMethod.update({ where: { id }, data: dto });
  }

  async deleteMethod(id: string): Promise<void> {
    await this.assertMethodExists(id);
    await this.prisma.shippingMethod.delete({ where: { id } });
  }

  private async assertMethodExists(id: string): Promise<void> {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('Shipping method not found');
  }
}
