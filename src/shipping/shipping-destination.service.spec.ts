import { ShippingDestinationService } from './shipping-destination.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeoIpService } from '../analytics-tracking/geo-ip.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { ShippingService } from './shipping.service';

interface CountryRow {
  isActive: boolean;
  isShippingEnabled: boolean;
}

/**
 * Fakes the three inputs the rule reads — the country list, the quote, the
 * IP lookup — so what is under test is how they combine.
 */
function build(opts: {
  countries: Record<string, CountryRow>;
  /** Quoted method windows per country, in quote order. Absent = no methods. */
  quotes: Record<string, Array<[number, number]>>;
  ipCountry?: Record<string, string>;
  productionDays?: number;
}) {
  const findUnique = jest.fn(({ where }: { where: { isoCode: string } }) => Promise.resolve(opts.countries[where.isoCode] ?? null));
  const getMethodsForCountry = jest.fn((code: string) =>
    Promise.resolve({
      zone: null,
      methods: (opts.quotes[code] ?? []).map(([estimatedDaysMin, estimatedDaysMax]) => ({ estimatedDaysMin, estimatedDaysMax })),
    }),
  );
  const prisma = { country: { findUnique } } as unknown as PrismaService;
  const shipping = { getMethodsForCountry } as unknown as ShippingService;
  const geo = { countryFromIp: (ip: string | null) => (ip ? (opts.ipCountry?.[ip] ?? null) : null) } as unknown as GeoIpService;
  const settings = { getEmbroideryConfig: () => ({ productionDays: opts.productionDays ?? 0 }) } as unknown as PlatformSettingsService;
  return { service: new ShippingDestinationService(prisma, shipping, geo, settings), findUnique, getMethodsForCountry };
}

const ON: CountryRow = { isActive: true, isShippingEnabled: true };

describe('ShippingDestinationService', () => {
  it('names the IP country with the default method window', async () => {
    const { service } = build({ countries: { ES: ON }, quotes: { ES: [[3, 5], [1, 2]] }, ipCountry: { '1.1.1.1': 'ES' } });
    await expect(service.resolve('1.1.1.1')).resolves.toEqual({ country: 'ES', deliveryDaysMin: 3, deliveryDaysMax: 5 });
  });

  it('adds embroidery production to the upper bound only', async () => {
    const { service } = build({ countries: { FR: ON }, quotes: { FR: [[3, 7]] }, ipCountry: { ip: 'FR' }, productionDays: 2 });
    await expect(service.resolve('ip')).resolves.toEqual({ country: 'FR', deliveryDaysMin: 3, deliveryDaysMax: 9 });
  });

  it('stays generic for a country with shipping switched off, even when a catch-all zone would quote it', async () => {
    const { service } = build({ countries: { US: { isActive: true, isShippingEnabled: false } }, quotes: { US: [[1, 3]] }, ipCountry: { ip: 'US' } });
    await expect(service.resolve('ip')).resolves.toEqual({ country: null, deliveryDaysMin: null, deliveryDaysMax: null });
  });

  it('stays generic for an inactive or unknown country', async () => {
    const { service } = build({ countries: { DE: { isActive: false, isShippingEnabled: true } }, quotes: { DE: [[2, 4]], JP: [[2, 4]] }, ipCountry: { a: 'DE', b: 'JP' } });
    await expect(service.resolve('a')).resolves.toMatchObject({ country: null });
    await expect(service.resolve('b')).resolves.toMatchObject({ country: null });
  });

  it('stays generic for an enabled country no zone quotes a method for', async () => {
    const { service } = build({ countries: { CH: ON }, quotes: {}, ipCountry: { ip: 'CH' } });
    await expect(service.resolve('ip')).resolves.toMatchObject({ country: null });
  });

  it('stays generic when the IP does not resolve', async () => {
    const { service } = build({ countries: { FR: ON }, quotes: { FR: [[3, 5]] } });
    await expect(service.resolve(null)).resolves.toMatchObject({ country: null });
  });

  it('prefers the country chosen at checkout over the IP', async () => {
    const { service } = build({ countries: { FR: ON, BE: ON }, quotes: { FR: [[3, 5]], BE: [[4, 6]] }, ipCountry: { ip: 'FR' } });
    await expect(service.resolve('ip', 'be')).resolves.toEqual({ country: 'BE', deliveryDaysMin: 4, deliveryDaysMax: 6 });
  });

  it('falls back to the IP when the hint is not served or not a country code', async () => {
    const { service } = build({ countries: { FR: ON, US: { isActive: true, isShippingEnabled: false } }, quotes: { FR: [[3, 5]] }, ipCountry: { ip: 'FR' } });
    await expect(service.resolve('ip', 'US')).resolves.toMatchObject({ country: 'FR' });
    await expect(service.resolve('ip', 'France')).resolves.toMatchObject({ country: 'FR' });
  });

  it('rejects a zero-day window as misconfigured', async () => {
    const { service } = build({ countries: { FR: ON }, quotes: { FR: [[0, 0]] }, ipCountry: { ip: 'FR' } });
    await expect(service.resolve('ip')).resolves.toMatchObject({ country: null });
  });

  it('reuses a country answer instead of re-querying on every page view', async () => {
    const { service, findUnique, getMethodsForCountry } = build({ countries: { ES: ON, US: { isActive: true, isShippingEnabled: false } }, quotes: { ES: [[3, 5]] }, ipCountry: { a: 'ES', b: 'US' } });
    await service.resolve('a');
    await service.resolve('a');
    await service.resolve('b');
    await service.resolve('b');
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(getMethodsForCountry).toHaveBeenCalledTimes(1);
  });
});

describe('ShippingDestinationService.productOptions', () => {
  const ON: CountryRow = { isActive: true, isShippingEnabled: true };
  const EU = { id: 'eu', countryCodes: ['FR', 'BE'] };
  const WORLD = { id: 'world', countryCodes: [] as string[] };

  function buildProduct(opts: {
    countries: Record<string, CountryRow>;
    /** Methods quoted per country: [id, priceCents]. */
    quotes: Record<string, Array<[string, number]>>;
    /** Methods quoted per zone set ("eu,world"). */
    zoneQuotes?: Record<string, Array<[string, number]>>;
    zones?: Array<{ id: string; countryCodes: string[] }>;
    ipCountry?: Record<string, string>;
    product?: { freeShipping: boolean; freeShippingDaysMin: number | null; freeShippingDaysMax: number | null; freeShippingUpgradeMethods: { id: string }[] } | null;
  }) {
    const product =
      opts.product === undefined ? { freeShipping: false, freeShippingDaysMin: null, freeShippingDaysMax: null, freeShippingUpgradeMethods: [] } : opts.product;
    const enabled = Object.entries(opts.countries)
      .filter(([, c]) => c.isActive && c.isShippingEnabled)
      .map(([isoCode]) => ({ isoCode }))
      .sort((x, y) => x.isoCode.localeCompare(y.isoCode));
    const prisma = {
      country: {
        findUnique: jest.fn(({ where }: { where: { isoCode: string } }) => Promise.resolve(opts.countries[where.isoCode] ?? null)),
        findMany: jest.fn(() => Promise.resolve(enabled)),
      },
      product: { findFirst: jest.fn(() => Promise.resolve(product)) },
    } as unknown as PrismaService;
    const toMethods = (rows: Array<[string, number]> = []) => rows.map(([id, priceCents]) => ({ id, priceCents }));
    const getMethodsForCountry = jest.fn((code: string) => Promise.resolve({ zone: null, methods: toMethods(opts.quotes[code]) }));
    const quoteZones = jest.fn((zones: Array<{ id: string }>) =>
      Promise.resolve({ zone: null, methods: toMethods(opts.zoneQuotes?.[zones.map((z) => z.id).join(',')]) }),
    );
    const shipping = { getMethodsForCountry, quoteZones, listActiveZones: () => Promise.resolve(opts.zones ?? [EU, WORLD]) } as unknown as ShippingService;
    const geo = { countryFromIp: (ip: string | null) => (ip ? (opts.ipCountry?.[ip] ?? null) : null) } as unknown as GeoIpService;
    const settings = { getEmbroideryConfig: () => ({ productionDays: 0 }) } as unknown as PlatformSettingsService;
    return { service: new ShippingDestinationService(prisma, shipping, geo, settings), getMethodsForCountry, quoteZones };
  }

  it("quotes the IP country with checkout's rules for this product alone", async () => {
    const { service, getMethodsForCountry } = buildProduct({ countries: { FR: ON }, quotes: { FR: [['std', 490], ['relay', 390]] }, ipCountry: { ip: 'FR' } });
    const res = await service.productOptions('p1', 'ip', null, 2500, 'fr');
    expect(res).toEqual({ country: 'FR', freeShipping: false, methods: [{ id: 'std', priceCents: 490 }, { id: 'relay', priceCents: 390 }] });
    expect(getMethodsForCountry).toHaveBeenCalledWith('FR', 2500, 'fr', { productIds: ['p1'] });
  });

  it('passes free shipping and its upgrades exactly as checkout does', async () => {
    const { service, getMethodsForCountry } = buildProduct({
      countries: { FR: ON },
      quotes: { FR: [['__free__', 0]] },
      ipCountry: { ip: 'FR' },
      product: { freeShipping: true, freeShippingDaysMin: 2, freeShippingDaysMax: 4, freeShippingUpgradeMethods: [{ id: 'express' }] },
    });
    await expect(service.productOptions('p1', 'ip', null, 0)).resolves.toMatchObject({ country: 'FR', freeShipping: true });
    expect(getMethodsForCountry).toHaveBeenCalledWith('FR', 0, undefined, {
      forceFree: true,
      upgradeMethodIds: ['express'],
      freeDaysMin: 2,
      freeDaysMax: 4,
      productIds: ['p1'],
    });
  });

  it('prefers the checkout country over the IP', async () => {
    const { service } = buildProduct({ countries: { FR: ON, BE: ON }, quotes: { FR: [['a', 1]], BE: [['b', 1]] }, ipCountry: { ip: 'FR' } });
    await expect(service.productOptions('p1', 'ip', 'BE', 0)).resolves.toMatchObject({ country: 'BE' });
  });

  it('lists every option any shipping country gets, once each, cheapest first, when the visitor country is not served', async () => {
    const { service, getMethodsForCountry, quoteZones } = buildProduct({
      countries: { US: { isActive: true, isShippingEnabled: false }, FR: ON, BE: ON, ES: ON },
      quotes: {},
      zoneQuotes: { 'eu,world': [['express', 1200], ['relay', 490]], world: [['express', 1200]] },
      ipCountry: { ip: 'US' },
    });
    const res = await service.productOptions('p1', 'ip', null, 0);
    expect(getMethodsForCountry).not.toHaveBeenCalled();
    expect(res).toEqual({
      country: null,
      freeShipping: false,
      methods: [
        { id: 'relay', priceCents: 490 },
        { id: 'express', priceCents: 1200 },
      ],
    });
    // FR and BE share a zone set: quoted once.
    expect(quoteZones).toHaveBeenCalledTimes(2);
  });

  it('ignores countries no zone serves', async () => {
    const { service, quoteZones } = buildProduct({ countries: { FR: ON, JP: ON }, quotes: {}, zones: [EU], zoneQuotes: { eu: [['free', 0]] } });
    await expect(service.productOptions('p1', null, null, 0)).resolves.toEqual({ country: null, freeShipping: false, methods: [{ id: 'free', priceCents: 0 }] });
    expect(quoteZones).toHaveBeenCalledTimes(1);
  });

  it('is empty when nothing ships anywhere', async () => {
    const { service } = buildProduct({ countries: { CH: ON }, quotes: {}, zones: [], ipCountry: { ip: 'CH' } });
    await expect(service.productOptions('p1', 'ip', null, 0)).resolves.toEqual({ country: null, freeShipping: false, methods: [] });
  });

  it('404s an unknown product', async () => {
    const { service } = buildProduct({ countries: {}, quotes: {}, product: null });
    await expect(service.productOptions('nope', null, null, 0)).rejects.toThrow('Product not found');
  });
});
