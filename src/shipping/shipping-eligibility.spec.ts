import { ShippingService } from './shipping.service';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationsService } from '../translations/translations.service';

const ZONE = {
  id: 'zone-1',
  name: 'Worldwide',
  countryCodes: [] as string[],
  isActive: true,
  surchargeCents: 0,
  freeShippingThresholdCents: null,
  estimatedDeliveryDays: null,
};

interface MethodRow {
  id: string;
  code: string | null;
  name: string;
  requiresProductOptIn: boolean;
  requiresPickupPoint: boolean;
  supportedCountryCodes: string[];
  availableForFreeShipping: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  /** Products opted into this method, used to fake Prisma's relation _count. */
  optedInProductIds: string[];
}

function method(overrides: Partial<MethodRow> & Pick<MethodRow, 'id'>): MethodRow {
  return {
    code: null,
    name: overrides.id,
    requiresProductOptIn: false,
    requiresPickupPoint: false,
    supportedCountryCodes: [],
    availableForFreeShipping: false,
    estimatedDaysMin: 2,
    estimatedDaysMax: 5,
    optedInProductIds: [],
    ...overrides,
  };
}

/**
 * Fakes only what the quoting path touches: the zone lookup, the method list,
 * and the grouped opt-in count. Keeps the rules under test rather than Prisma.
 */
function buildService(methods: MethodRow[]): ShippingService {
  const rows = methods.map((m) => ({
    ...m,
    description: null,
    carrier: null,
    priceCents: 500,
    freeAboveCents: null,
  }));

  const prisma = {
    shippingZone: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(ZONE),
    },
    shippingMethod: {
      findMany: jest.fn().mockImplementation((args: { where?: { id?: { in: string[] } }; select?: unknown }) => {
        // The grouped opt-in query selects _count; the plain listing does not.
        if (args?.select) {
          const wanted = args.where?.id?.in ?? [];
          const productIds = ((args.select as { _count: { select: { eligibleProducts: { where: { id: { in: string[] } } } } } })._count.select
            .eligibleProducts.where.id.in) as string[];
          return Promise.resolve(
            methods
              .filter((m) => wanted.includes(m.id))
              .map((m) => ({
                id: m.id,
                _count: { eligibleProducts: m.optedInProductIds.filter((p) => productIds.includes(p)).length },
              })),
          );
        }
        return Promise.resolve(rows);
      }),
      count: jest.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;

  const translations = {
    maybeApply: (rowsIn: unknown[]) => Promise.resolve(rowsIn),
    maybeApplyOne: (row: unknown) => Promise.resolve(row),
  } as unknown as TranslationsService;
  return new ShippingService(prisma, translations);
}

const quotedIds = async (svc: ShippingService, country: string, productIds?: string[]) =>
  (await svc.getMethodsForCountry(country, 1000, undefined, { productIds })).methods.map((m) => m.id);

describe('ShippingService — method eligibility', () => {
  describe('country narrowing', () => {
    it('offers a method with no country list anywhere in its zone', async () => {
      const svc = buildService([method({ id: 'standard' })]);
      await expect(quotedIds(svc, 'MA')).resolves.toEqual(['standard']);
    });

    it('offers a country-scoped method only inside its list', async () => {
      const svc = buildService([method({ id: 'standard' }), method({ id: 'relay', supportedCountryCodes: ['FR', 'BE'] })]);

      await expect(quotedIds(svc, 'FR')).resolves.toEqual(['standard', 'relay']);
      await expect(quotedIds(svc, 'MA')).resolves.toEqual(['standard']);
    });

    it('matches the country case-insensitively', async () => {
      const svc = buildService([method({ id: 'relay', supportedCountryCodes: ['FR'] })]);
      await expect(quotedIds(svc, 'fr')).resolves.toEqual(['relay']);
    });
  });

  describe('all-or-nothing product opt-in', () => {
    const optIn = (optedInProductIds: string[]) =>
      method({ id: 'relay', requiresProductOptIn: true, requiresPickupPoint: true, code: 'mondial_relay', optedInProductIds });

    it('offers the method when every product opted in', async () => {
      const svc = buildService([method({ id: 'standard' }), optIn(['p1', 'p2'])]);
      await expect(quotedIds(svc, 'FR', ['p1', 'p2'])).resolves.toEqual(['standard', 'relay']);
    });

    it('withdraws the method when one product in a mixed cart did not opt in', async () => {
      const svc = buildService([method({ id: 'standard' }), optIn(['p1'])]);
      await expect(quotedIds(svc, 'FR', ['p1', 'p2'])).resolves.toEqual(['standard']);
    });

    it('withdraws the method when no product opted in', async () => {
      const svc = buildService([method({ id: 'standard' }), optIn([])]);
      await expect(quotedIds(svc, 'FR', ['p1'])).resolves.toEqual(['standard']);
    });

    it('withdraws the method when the basket is unknown', async () => {
      // The public quote endpoint has no cart, so the rule cannot be proven.
      const svc = buildService([method({ id: 'standard' }), optIn(['p1'])]);
      await expect(quotedIds(svc, 'FR')).resolves.toEqual(['standard']);
      await expect(quotedIds(svc, 'FR', [])).resolves.toEqual(['standard']);
    });

    it('is unaffected by quantities — eligibility is per distinct product', async () => {
      // Callers pass distinct ids; ten units of p1 is still one product.
      const svc = buildService([optIn(['p1'])]);
      await expect(quotedIds(svc, 'FR', ['p1'])).resolves.toEqual(['relay']);
    });

    it('never restricts an ordinary method, whatever the basket', async () => {
      const svc = buildService([method({ id: 'standard' })]);
      await expect(quotedIds(svc, 'FR', ['p1', 'p2', 'p3'])).resolves.toEqual(['standard']);
    });

    it('applies both gates together — opted in, but the wrong country', async () => {
      const svc = buildService([method({ id: 'relay', requiresProductOptIn: true, supportedCountryCodes: ['FR'], optedInProductIds: ['p1'] })]);
      await expect(quotedIds(svc, 'ES', ['p1'])).resolves.toEqual([]);
    });
  });

  describe('quoted shape', () => {
    it('carries the code and pickup-point flag through to the quote', async () => {
      const svc = buildService([method({ id: 'relay', code: 'mondial_relay', requiresPickupPoint: true })]);
      const { methods } = await svc.getMethodsForCountry('FR', 1000);

      expect(methods[0]).toMatchObject({ code: 'mondial_relay', requiresPickupPoint: true });
    });

    it('marks an ordinary method as needing no pickup point', async () => {
      const svc = buildService([method({ id: 'standard' })]);
      const { methods } = await svc.getMethodsForCountry('FR', 1000);

      expect(methods[0]).toMatchObject({ code: null, requiresPickupPoint: false });
    });

    it('never asks the synthetic free-shipping option for a pickup point', async () => {
      const svc = buildService([method({ id: 'standard' })]);
      const { methods } = await svc.getMethodsForCountry('FR', 1000, undefined, { forceFree: true });

      expect(methods[0]).toMatchObject({ name: 'Free shipping', requiresPickupPoint: false, code: null });
    });
  });

  describe('free-shipping delivery window', () => {
    it('borrows the window of the zone\'s ordinary method, not an upgrade', async () => {
      const svc = buildService([
        method({ id: 'express', availableForFreeShipping: true, estimatedDaysMin: 1, estimatedDaysMax: 2 }),
        method({ id: 'standard', estimatedDaysMin: 3, estimatedDaysMax: 7 }),
      ]);
      const { methods } = await svc.getMethodsForCountry('FR', 1000, undefined, { forceFree: true, upgradeMethodIds: ['express'] });

      expect(methods[0]).toMatchObject({ name: 'Free shipping', estimatedDaysMin: 3, estimatedDaysMax: 7 });
    });

    it('falls back to the slowest method when every method is flagged for free shipping', async () => {
      // A misconfigured zone. Free delivery must still never be advertised as
      // arriving sooner than the upgrade being sold beside it.
      // The slowest method is deliberately *not* last in the list: taking the
      // last one would pass on a shorter window and hide the regression.
      const svc = buildService([
        method({ id: 'priority', availableForFreeShipping: true, estimatedDaysMin: 2, estimatedDaysMax: 4 }),
        method({ id: 'express', availableForFreeShipping: true, estimatedDaysMin: 1, estimatedDaysMax: 2 }),
      ]);
      const { methods } = await svc.getMethodsForCountry('FR', 1000, undefined, { forceFree: true, upgradeMethodIds: ['express'] });

      expect(methods[0]).toMatchObject({ name: 'Free shipping', estimatedDaysMax: 4 });
    });

    it('prefers the days an admin set on the product', async () => {
      const svc = buildService([method({ id: 'standard', estimatedDaysMin: 3, estimatedDaysMax: 7 })]);
      const { methods } = await svc.getMethodsForCountry('FR', 1000, undefined, { forceFree: true, freeDaysMin: 5, freeDaysMax: 9 });

      expect(methods[0]).toMatchObject({ estimatedDaysMin: 5, estimatedDaysMax: 9 });
    });
  });
});
