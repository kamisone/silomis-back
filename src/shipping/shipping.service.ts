import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationsService } from '../translations/translations.service';
import { UpdateMethodDto, UpdateZoneDto, UpsertMethodDto, UpsertZoneDto } from './dto/shipping.dto';
import { ShippingMethod, ShippingZone } from '../../generated/prisma/client';

const ET_SHIPPING_METHOD = 'shop_shipping_method';

/** Synthetic id for the free-shipping option injected into a quote — not a real ShippingMethod row. */
export const FREE_SHIPPING_METHOD_ID = '00000000-0000-0000-0000-000000000000';

export interface QuotedMethod {
  id: string;
  name: string;
  description: string | null;
  carrier: string | null;
  priceCents: number;
  originalPriceCents: number;
  isFree: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
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
    const translated = (await this.translations.maybeApply(allMethods, ET_SHIPPING_METHOD, lang)) as ShippingMethod[];

    if (opts.forceFree) {
      return { zone, methods: this.buildFreeShippingOptions(zone, translated, cartTotalCents, opts) };
    }

    return { zone, methods: this.applyZonePricing(zone, translated, cartTotalCents) };
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
        name: m.name,
        description: m.description,
        carrier: m.carrier,
        priceCents: isFree ? 0 : originalPriceCents,
        originalPriceCents,
        isFree,
        estimatedDaysMin: m.estimatedDaysMin,
        estimatedDaysMax: m.estimatedDaysMax,
      };
    });
  }

  private buildFreeShippingOptions(zone: ShippingZone, methods: ShippingMethod[], cartTotalCents: number, opts: FreeShippingOptions): QuotedMethod[] {
    const upgrades = methods.filter((m) => m.availableForFreeShipping && opts.upgradeMethodIds?.includes(m.id));
    const nonUpgrade = methods.filter((m) => !m.availableForFreeShipping);
    const source = nonUpgrade[0] ?? methods[methods.length - 1] ?? null;

    const freeOption: QuotedMethod = {
      id: FREE_SHIPPING_METHOD_ID,
      name: 'Free shipping',
      description: null,
      carrier: null,
      priceCents: 0,
      originalPriceCents: 0,
      isFree: true,
      estimatedDaysMin: opts.freeDaysMin ?? source?.estimatedDaysMin ?? 3,
      estimatedDaysMax: opts.freeDaysMax ?? source?.estimatedDaysMax ?? 7,
    };

    const upgradeOptions: QuotedMethod[] = upgrades.map((m) => {
      const originalPriceCents = m.priceCents + zone.surchargeCents;
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        carrier: m.carrier,
        priceCents: originalPriceCents,
        originalPriceCents,
        isFree: false,
        estimatedDaysMin: m.estimatedDaysMin,
        estimatedDaysMax: m.estimatedDaysMax,
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
