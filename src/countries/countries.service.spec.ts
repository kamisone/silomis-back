import { CountriesService } from './countries.service';
import { COUNTRY_SEED } from './country-seed.data';

/**
 * Fake for the two tables seed() touches. `countries` is keyed by isoCode and
 * `settings` by key, so a "boot" is just constructing a new service over the
 * same store — which is exactly what a restart or a redeploy does.
 */
function makeStore(initialCountries: string[] = []) {
  const countries = new Map<string, { isoCode: string }>(initialCountries.map((c) => [c, { isoCode: c }]));
  const settings = new Map<string, string>();

  const prisma = {
    country: {
      count: jest.fn(async () => countries.size),
      createMany: jest.fn(async ({ data }: { data: Array<{ isoCode: string }> }) => {
        for (const row of data) if (!countries.has(row.isoCode)) countries.set(row.isoCode, row);
        return { count: data.length };
      }),
    },
    platformSettings: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key)! } : null,
      ),
      upsert: jest.fn(async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => {
        settings.set(where.key, settings.has(where.key) ? update.value : create.value);
        return { key: where.key, value: settings.get(where.key)! };
      }),
    },
  };
  const translations = { upsert: jest.fn(async () => undefined) };

  const boot = async () => {
    const service = new CountriesService(prisma as never, translations as never);
    await service.seed();
    return service;
  };

  return { countries, settings, translations, boot };
}

describe('CountriesService.seed', () => {
  it('seeds every country on a fresh install', async () => {
    const store = makeStore();

    await store.boot();

    expect([...store.countries.keys()].sort()).toEqual(COUNTRY_SEED.map((c) => c.isoCode).sort());
    expect(store.translations.upsert).toHaveBeenCalledTimes(COUNTRY_SEED.length);
  });

  it('never re-creates a country the admin deleted', async () => {
    const store = makeStore();
    await store.boot();
    store.countries.delete('US');

    await store.boot();
    await store.boot();

    expect(store.countries.has('US')).toBe(false);
  });

  it('backfills an install that predates the marker without resurrecting deletions', async () => {
    // Pre-fix database: rows exist, no marker was ever written, and the admin
    // has already deleted a country.
    const store = makeStore(COUNTRY_SEED.map((c) => c.isoCode).filter((c) => c !== 'DZ'));

    await store.boot();

    expect(store.countries.has('DZ')).toBe(false);
    expect(store.translations.upsert).not.toHaveBeenCalled();
  });

  it('still inserts a country added to the seed file after the first boot', async () => {
    const store = makeStore();
    await store.boot();
    const added = { isoCode: 'ZZ', name: 'Zzz', nameEn: 'Zzz', phonePrefix: '+999', currencyCode: 'EUR', isoCode3: 'ZZZ', continentCode: 'EU', isEuVat: false, isShippingEnabled: false };
    COUNTRY_SEED.push(added);

    try {
      await store.boot();
      expect(store.countries.has('ZZ')).toBe(true);
    } finally {
      COUNTRY_SEED.pop();
    }
  });
});
