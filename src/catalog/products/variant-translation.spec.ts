import { ProductsService } from './products.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_VARIANT_ATTR, ET_SHOP_VARIATION_OPTION } from '../../translations/translation-entities';

/**
 * Exercises the private overlay through its observable effect, which is what
 * the storefront actually consumes: translated attribute names, translated
 * option values, and a rebuilt variant title.
 */
type Translatable = Record<string, unknown>;

function serviceWith(rows: Record<string, Record<string, string>>): ProductsService {
  const translations = {
    maybeApply: (items: Translatable[], entityType: string, lang?: string) =>
      Promise.resolve(lang ? items.map((i) => ({ ...i, ...(rows[`${entityType}:${i.id as string}`] ?? {}) })) : items),
  } as unknown as TranslationsService;

  // translations is the 4th constructor arg and the only collaborator this
  // code path reaches.
  return new ProductsService({} as never, {} as never, {} as never, translations, {} as never, {} as never);
}

function productFixture() {
  const colour = { id: 'attr-colour', name: 'Couleur', sortOrder: 0 };
  const size = { id: 'attr-size', name: 'Taille', sortOrder: 1 };
  const black = { id: 'ov-black', value: 'Noir', displayValue: 'Noir' };
  const small = { id: 'ov-s', value: 'S', displayValue: 'S' };

  return {
    variants: [
      {
        title: 'Noir / S',
        options: [
          { attributeId: colour.id, value: 'Noir', optionValueId: black.id, optionValue: black, attribute: colour },
          { attributeId: size.id, value: 'S', optionValueId: small.id, optionValue: small, attribute: size },
        ],
      },
    ],
  };
}

const translate = (svc: ProductsService, product: unknown, lang?: string) =>
  (svc as unknown as { translateVariantOptionsInPlace: (p: unknown, l?: string) => Promise<void> }).translateVariantOptionsInPlace(product, lang);

describe('variant option translation on the product page', () => {
  it('overlays translated option values onto the variant options', async () => {
    const svc = serviceWith({
      [`${ET_SHOP_VARIATION_OPTION}:ov-black`]: { displayValue: 'Black' },
      [`${ET_SHOP_VARIATION_OPTION}:ov-s`]: { displayValue: 'Small' },
    });
    const product = productFixture();

    await translate(svc, product, 'en');

    expect(product.variants[0].options.map((o) => o.optionValue.displayValue)).toEqual(['Black', 'Small']);
  });

  it('translates attribute names too', async () => {
    const svc = serviceWith({ [`${ET_SHOP_VARIANT_ATTR}:attr-colour`]: { name: 'Colour' } });
    const product = productFixture();

    await translate(svc, product, 'en');

    expect(product.variants[0].options[0].attribute.name).toBe('Colour');
  });

  it('rebuilds the baked variant title from the translated values', async () => {
    const svc = serviceWith({
      [`${ET_SHOP_VARIATION_OPTION}:ov-black`]: { displayValue: 'Black' },
      [`${ET_SHOP_VARIATION_OPTION}:ov-s`]: { displayValue: 'Small' },
    });
    const product = productFixture();

    await translate(svc, product, 'en');

    // buildVariantTitle bakes this once in the base language; without the
    // rebuild the picker shows "Noir / S" on an otherwise English page.
    expect(product.variants[0].title).toBe('Black / Small');
  });

  it('orders the rebuilt title by attribute sort order, not option order', async () => {
    const svc = serviceWith({});
    const product = productFixture();
    product.variants[0].options.reverse();

    await translate(svc, product, 'en');

    expect(product.variants[0].title).toBe('Noir / S');
  });

  it('falls back per field to the stored value when a translation is missing', async () => {
    // Colour is translated, size is not — the untranslated one keeps its own
    // value rather than blanking or breaking the label.
    const svc = serviceWith({ [`${ET_SHOP_VARIATION_OPTION}:ov-black`]: { displayValue: 'Black' } });
    const product = productFixture();

    await translate(svc, product, 'en');

    expect(product.variants[0].options.map((o) => o.optionValue.displayValue)).toEqual(['Black', 'S']);
    expect(product.variants[0].title).toBe('Black / S');
  });

  it('leaves everything untouched with no lang', async () => {
    const svc = serviceWith({ [`${ET_SHOP_VARIATION_OPTION}:ov-black`]: { displayValue: 'Black' } });
    const product = productFixture();

    await translate(svc, product, undefined);

    expect(product.variants[0].options[0].optionValue.displayValue).toBe('Noir');
    expect(product.variants[0].title).toBe('Noir / S');
  });

  it('translates every variant sharing an option value, not just one of them', async () => {
    // Prisma hydrates a separate object per option row, so two variants using
    // "Noir" hold two distinct instances that both need the overlay.
    const svc = serviceWith({ [`${ET_SHOP_VARIATION_OPTION}:ov-black`]: { displayValue: 'Black' } });
    const colour = { id: 'attr-colour', name: 'Couleur', sortOrder: 0 };
    const product = {
      variants: [
        { title: 'Noir', options: [{ attributeId: colour.id, value: 'Noir', optionValueId: 'ov-black', optionValue: { id: 'ov-black', value: 'Noir', displayValue: 'Noir' }, attribute: { ...colour } }] },
        { title: 'Noir', options: [{ attributeId: colour.id, value: 'Noir', optionValueId: 'ov-black', optionValue: { id: 'ov-black', value: 'Noir', displayValue: 'Noir' }, attribute: { ...colour } }] },
      ],
    };

    await translate(svc, product, 'en');

    expect(product.variants.map((v) => v.title)).toEqual(['Black', 'Black']);
    expect(product.variants.map((v) => v.options[0].optionValue.displayValue)).toEqual(['Black', 'Black']);
  });

  it('does not fail on a product with no variants', async () => {
    const svc = serviceWith({});
    await expect(translate(svc, { variants: [] }, 'en')).resolves.toBeUndefined();
  });
});
