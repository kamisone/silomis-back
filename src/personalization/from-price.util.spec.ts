import { personalizationOffers } from './from-price.util';

function prismaWith(rows: Array<{ productId: string; priceCents: number; label: unknown }>) {
  return { personalizationPlacement: { findMany: jest.fn().mockResolvedValue(rows) } } as never;
}

describe('personalizationOffers', () => {
  it('returns an empty map without querying when there are no products', async () => {
    const prisma = prismaWith([]);
    expect((await personalizationOffers(prisma, [])).size).toBe(0);
    expect((prisma as { personalizationPlacement: { findMany: jest.Mock } }).personalizationPlacement.findMany).not.toHaveBeenCalled();
  });

  it('reports the cheapest position and no free ones when every position is paid', async () => {
    const offers = await personalizationOffers(
      prismaWith([
        { productId: 'p1', priceCents: 1000, label: { en: 'Front' } },
        { productId: 'p1', priceCents: 800, label: { en: 'Side' } },
      ]),
      ['p1'],
      'en',
    );
    expect(offers.get('p1')).toEqual({ fromCents: 800, freePositions: [], allFree: false });
  });

  it('names the free positions in the requested language, falling back to English', async () => {
    const offers = await personalizationOffers(
      prismaWith([
        { productId: 'p1', priceCents: 0, label: { en: 'Front panel', fr: 'Panneau avant' } },
        { productId: 'p1', priceCents: 900, label: { en: 'Back', fr: 'Arrière' } },
        { productId: 'p1', priceCents: 0, label: { en: 'Side' } },
      ]),
      ['p1'],
      'fr',
    );
    expect(offers.get('p1')).toEqual({ fromCents: 0, freePositions: ['Panneau avant', 'Side'], allFree: false });
  });

  it('flags a product whose every position is free, and keeps products apart', async () => {
    const offers = await personalizationOffers(
      prismaWith([
        { productId: 'p1', priceCents: 0, label: { en: 'Front' } },
        { productId: 'p2', priceCents: 500, label: { en: 'Front' } },
      ]),
      ['p1', 'p2', 'p3'],
    );
    expect(offers.get('p1')).toEqual({ fromCents: 0, freePositions: ['Front'], allFree: true });
    expect(offers.get('p2')).toEqual({ fromCents: 500, freePositions: [], allFree: false });
    expect(offers.has('p3')).toBe(false);
  });
});
