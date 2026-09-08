import { ProductsService } from './products.service';

/**
 * The storefront card's inline variation picker reads these fields, so what
 * publicList hands it has to be right: per-product swatch images, a variant
 * photo to swap the card to, no raw storage keys, and translated labels.
 */
type Resolver = (products: unknown[], lang?: string) => Promise<void>;

function makeService(opts: {
  optionImages?: Array<{ productId: string; optionValueId: string; mediaKey: string }>;
  urls?: Record<string, string>;
} = {}) {
  const prisma = {
    productOptionValueImage: {
      findMany: jest.fn(async () => opts.optionImages ?? []),
    },
  };
  const assetUrls = {
    resolveBatch: jest.fn(async (keys: string[]) => new Map(keys.map((k) => [k, (opts.urls ?? {})[k] ?? `https://cdn.test/${k}`]))),
  };
  const translations = { maybeApply: jest.fn(async (rows: unknown[]) => rows) };

  const service = new ProductsService(
    prisma as never,
    assetUrls as never,
    null as never,
    translations as never,
    null as never,
    null as never,
  );
  const resolve = (service as unknown as { resolveCardVariantOptionsInPlace: Resolver }).resolveCardVariantOptionsInPlace.bind(service);
  return { resolve, prisma, assetUrls };
}

interface OptionValue {
  id: string;
  value: string;
  displayValue: string;
  swatchValue: string | null;
  swatchType: string;
  sortOrder: number;
  swatchUrl?: string | null;
}

function colourVariant(over: Record<string, unknown> = {}) {
  return {
    title: 'Black / M',
    featuredMediaKey: 'variants/black.jpg',
    options: [
      {
        attributeId: 'attr-colour',
        optionValueId: 'ov-black',
        value: 'black',
        optionValue: { id: 'ov-black', value: 'black', displayValue: 'Black', swatchValue: 'swatches/raw-key.jpg', swatchType: 'image', sortOrder: 0 } as OptionValue,
        attribute: { id: 'attr-colour', name: 'Colour', displayType: 'swatch', sortOrder: 0 },
      },
    ],
    ...over,
  };
}

describe('publicList card variant resolution', () => {
  it('resolves the variant photo the card swaps to, and drops the raw storage key', async () => {
    const { resolve } = makeService();
    const products = [{ id: 'p1', variants: [colourVariant()] }];

    await resolve(products);

    const variant = products[0].variants[0] as Record<string, unknown>;
    expect(variant.featuredMediaUrl).toBe('https://cdn.test/variants/black.jpg');
    expect('featuredMediaKey' in variant).toBe(false);
  });

  it('resolves an image swatch from THIS product’s override, never another product’s', async () => {
    const { resolve } = makeService({
      optionImages: [
        { productId: 'p1', optionValueId: 'ov-black', mediaKey: 'p1/black.jpg' },
        { productId: 'p2', optionValueId: 'ov-black', mediaKey: 'p2/black.jpg' },
      ],
    });
    const products = [
      { id: 'p1', variants: [colourVariant()] },
      { id: 'p2', variants: [colourVariant()] },
    ];

    await resolve(products);

    expect(products[0].variants[0].options[0].optionValue.swatchUrl).toBe('https://cdn.test/p1/black.jpg');
    expect(products[1].variants[0].options[0].optionValue.swatchUrl).toBe('https://cdn.test/p2/black.jpg');
  });

  it('never leaks the raw storage key an image swatch keeps in swatchValue', async () => {
    const { resolve } = makeService({ optionImages: [{ productId: 'p1', optionValueId: 'ov-black', mediaKey: 'p1/black.jpg' }] });
    const products = [{ id: 'p1', variants: [colourVariant()] }];

    await resolve(products);

    expect(products[0].variants[0].options[0].optionValue.swatchValue).toBeNull();
  });

  it('leaves a colour swatch’s hex alone and gives it no image URL', async () => {
    const { resolve } = makeService();
    const products = [
      {
        id: 'p1',
        variants: [
          colourVariant({
            options: [
              {
                attributeId: 'attr-colour',
                optionValueId: 'ov-red',
                value: 'red',
                optionValue: { id: 'ov-red', value: 'red', displayValue: 'Red', swatchValue: '#ff0000', swatchType: 'color', sortOrder: 0 } as OptionValue,
                attribute: { id: 'attr-colour', name: 'Colour', displayType: 'swatch', sortOrder: 0 },
              },
            ],
          }),
        ],
      },
    ];

    await resolve(products);

    const ov = products[0].variants[0].options[0].optionValue;
    expect(ov.swatchValue).toBe('#ff0000');
    expect(ov.swatchUrl).toBeNull();
  });

  it('stays at three queries however many cards the page holds', async () => {
    const { resolve, prisma, assetUrls } = makeService();
    const products = Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, variants: [colourVariant(), colourVariant()] }));

    await resolve(products, 'fr');

    // One option-image lookup and one URL batch — the per-product helpers this
    // replaces would have issued two apiece, i.e. 48 round trips for this page.
    expect(prisma.productOptionValueImage.findMany).toHaveBeenCalledTimes(1);
    expect(assetUrls.resolveBatch).toHaveBeenCalledTimes(1);
  });

  it('translates every card’s options in one pass, not one pass per product', async () => {
    const { resolve } = makeService();
    const translations = { maybeApply: jest.fn(async (rows: unknown[]) => rows) };
    const service = new ProductsService(
      { productOptionValueImage: { findMany: jest.fn(async () => []) } } as never,
      { resolveBatch: jest.fn(async () => new Map()) } as never,
      null as never,
      translations as never,
      null as never,
      null as never,
    );
    const products = [
      { id: 'p1', variants: [colourVariant()] },
      { id: 'p2', variants: [colourVariant()] },
    ];

    await (service as unknown as { resolveCardVariantOptionsInPlace: Resolver }).resolveCardVariantOptionsInPlace(products, 'fr');

    // Exactly two: one for the option values, one for the attributes.
    expect(translations.maybeApply).toHaveBeenCalledTimes(2);
    void resolve;
  });

  it('does nothing at all for a page of products with no variants', async () => {
    const { resolve, prisma } = makeService();

    await resolve([{ id: 'p1', variants: [] }]);

    expect(prisma.productOptionValueImage.findMany).not.toHaveBeenCalled();
  });
});
