import { ProductPublicController } from './products/product-public.controller';

/**
 * "You may also like" reads from a Redis-cached similarity computation whose
 * key carries no language. The overlay therefore has to happen after the
 * cache, in the controller — translating before it would serve whichever
 * locale warmed the cache to everyone.
 */
function makeController(overlay: Record<string, string>) {
  const maybeApply = jest.fn(async (items: Array<Record<string, unknown>>, entityType: string, lang?: string) => {
    void entityType;
    if (!lang) return items;
    return items.map((i) => (overlay[i.id as string] ? { ...i, title: overlay[i.id as string] } : i));
  });

  const products = { findBySlug: jest.fn(async () => ({ id: 'p1' })) };
  const recommendations = {
    getFrequentlyBoughtTogether: jest.fn(async () => [{ id: 'a', slug: 'a', title: 'Cotton tee' }]),
    getSimilarProducts: jest.fn(async () => [{ id: 'b', slug: 'b', title: 'Linen shirt' }]),
  };

  const controller = new ProductPublicController(products as never, recommendations as never, null as never, { maybeApply } as never);
  return { controller, maybeApply };
}

describe('recommendations translation', () => {
  it('translates both lists, not just one of them', async () => {
    const { controller } = makeController({ a: 'T-shirt en coton', b: 'Chemise en lin' });

    const res = await controller.getRecommendations('slug', undefined, 'fr');

    expect(res.frequentlyBoughtTogether[0].title).toBe('T-shirt en coton');
    expect(res.similar[0].title).toBe('Chemise en lin');
  });

  it('leaves titles alone when no language is asked for', async () => {
    const { controller } = makeController({ a: 'T-shirt en coton', b: 'Chemise en lin' });

    const res = await controller.getRecommendations('slug');

    expect(res.similar[0].title).toBe('Linen shirt');
  });

  it('keeps the base title for a product with no translation', async () => {
    const { controller } = makeController({ a: 'T-shirt en coton' });

    const res = await controller.getRecommendations('slug', undefined, 'fr');

    expect(res.similar[0].title).toBe('Linen shirt');
  });

  it('passes the product entity type through', async () => {
    const { controller, maybeApply } = makeController({});

    await controller.getRecommendations('slug', undefined, 'fr');

    // A wrong entity type returns no rows rather than failing — the carousel
    // would silently stay in the base language, which is the bug being fixed.
    expect(maybeApply.mock.calls.every((c) => c[1] === 'shop_product')).toBe(true);
  });
});
