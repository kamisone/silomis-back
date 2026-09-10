import { ProductsService } from './products.service';

type Row = Record<string, unknown>;

/**
 * The product page's breadcrumb renders the category name off the product
 * payload, not off the category endpoint — so the payload has to carry the
 * overlay too. Without it a Spanish shopper reads "Inicio / Men".
 */
function makeService(overlay: Record<string, string>) {
  const maybeApply = jest.fn(async (rows: Row[], entityType: string) => {
    // Mirrors TranslationsService: returns COPIES with the overlaid fields.
    void entityType;
    return rows.map((r) => ({ ...r, ...(overlay[r.id as string] ? { name: overlay[r.id as string] } : {}) }));
  });
  const service = new ProductsService(null as never, null as never, null as never, { maybeApply } as never, null as never, null as never);
  const translate = (product: Row, lang?: string) =>
    (service as unknown as { translateCategoriesInPlace(p: Row, l?: string): Promise<void> }).translateCategoriesInPlace(product, lang);
  return { translate, maybeApply };
}

describe('category translations on the product payload', () => {
  it('overlays the name the breadcrumb renders', async () => {
    const { translate } = makeService({ c1: 'Hombre' });
    const product = { primaryCategory: { id: 'c1', name: 'Men' }, categories: [{ id: 'c1', name: 'Men' }] };

    await translate(product, 'es');

    expect(product.primaryCategory.name).toBe('Hombre');
  });

  it('writes back to both copies of one category', async () => {
    const { translate } = makeService({ c1: 'Hombre' });
    // Prisma hydrates primaryCategory and the categories entry separately, so
    // overlaying only the lookup list would leave one of them untranslated.
    const product = { primaryCategory: { id: 'c1', name: 'Men' }, categories: [{ id: 'c1', name: 'Men' }] };

    await translate(product, 'es');

    expect(product.categories[0].name).toBe('Hombre');
  });

  it('looks each category up once, however many places it appears', async () => {
    const { translate, maybeApply } = makeService({ c1: 'Hombre' });
    const product = { primaryCategory: { id: 'c1', name: 'Men' }, categories: [{ id: 'c1', name: 'Men' }, { id: 'c2', name: 'Sale' }] };

    await translate(product, 'es');

    expect(maybeApply).toHaveBeenCalledTimes(1);
    expect((maybeApply.mock.calls[0][0] as Row[]).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('uses the category entity type, not the product one', async () => {
    const { translate, maybeApply } = makeService({});
    await translate({ categories: [{ id: 'c1', name: 'Men' }] }, 'es');

    // A mismatch here returns no rows rather than failing, so it would be
    // invisible at runtime — exactly how option-value translations broke.
    expect(maybeApply.mock.calls[0][1]).toBe('shop_product_category');
  });

  it('leaves an untranslated category on its base name', async () => {
    const { translate } = makeService({});
    const product = { primaryCategory: { id: 'c1', name: 'Men' }, categories: [] };

    await translate(product, 'es');

    expect(product.primaryCategory.name).toBe('Men');
  });

  it('does nothing at all without a language — the base language needs no overlay', async () => {
    const { translate, maybeApply } = makeService({ c1: 'Hombre' });

    await translate({ primaryCategory: { id: 'c1', name: 'Men' } });

    expect(maybeApply).not.toHaveBeenCalled();
  });

  it('handles a product with no category', async () => {
    const { translate, maybeApply } = makeService({});
    await expect(translate({ categories: [] }, 'es')).resolves.toBeUndefined();
    expect(maybeApply).not.toHaveBeenCalled();
  });
});
