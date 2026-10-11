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
