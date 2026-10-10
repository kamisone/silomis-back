import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { parseSwatchLocale, pickSwatchPhoto, swatchPhotoFitsLocale, swatchPhotosForLocale } from './product-content.util';
import { ProductMediaItem } from '../types/product-content.types';

const img = (key: string, locales?: ProductMediaItem['locales']): ProductMediaItem => ({ key, type: 'image', ...(locales ? { locales } : {}) });

describe('swatch photos per language — helpers', () => {
  const rows = [
    { optionValueId: 'black', locale: '', mediaKey: 'black.jpg' },
    { optionValueId: 'black', locale: 'fr', mediaKey: 'black-fr.jpg' },
    { optionValueId: 'red', locale: '', mediaKey: 'red.jpg' },
  ];

  it('picks a language’s own photo, else the default', () => {
    expect(pickSwatchPhoto(rows.filter((r) => r.optionValueId === 'black'), 'fr')?.mediaKey).toBe('black-fr.jpg');
    expect(pickSwatchPhoto(rows.filter((r) => r.optionValueId === 'black'), 'de')?.mediaKey).toBe('black.jpg');
  });

  it('reads no language, or an unknown one, as the storefront default (English)', () => {
    const enRows = [{ locale: '', mediaKey: 'd' }, { locale: 'en', mediaKey: 'en' }];
    expect(pickSwatchPhoto(enRows, undefined)?.mediaKey).toBe('en');
    expect(pickSwatchPhoto(enRows, 'ja')?.mediaKey).toBe('en');
  });

  it('groups by option for a whole product', () => {
    const picked = swatchPhotosForLocale(rows, (r) => r.optionValueId, 'fr');
    expect(picked.get('black')?.mediaKey).toBe('black-fr.jpg');
    expect(picked.get('red')?.mediaKey).toBe('red.jpg');
  });

  it('parses the language of a swatch photo', () => {
    expect(parseSwatchLocale(undefined)).toBe('');
    expect(parseSwatchLocale(' FR ')).toBe('fr');
    expect(parseSwatchLocale('xx')).toBeNull();
  });

  it('lets the default be only a photo every language shows, and a language photo one its gallery shows', () => {
    const media = [img('shared'), img('fr-only', ['fr']), img('pt-only', ['pt'])];
    expect(swatchPhotoFitsLocale(media, 'shared', '')).toBe(true);
    expect(swatchPhotoFitsLocale(media, 'fr-only', '')).toBe(false);
    expect(swatchPhotoFitsLocale(media, 'fr-only', 'fr')).toBe(true);
    expect(swatchPhotoFitsLocale(media, 'pt-only', 'fr')).toBe(false);
    expect(swatchPhotoFitsLocale(media, 'shared', 'fr')).toBe(true);
  });
});

describe('ProductsService — swatch photos per language', () => {
  function make(opts: { media: ProductMediaItem[]; hasDefault?: boolean }) {
    const prisma = {
      product: {
        findUnique: jest.fn(async () => ({ id: 'p1', media: opts.media })),
      },
      variationOptionValue: { findUnique: jest.fn(async () => ({ id: 'black', attributeId: 'color' })) },
      productVariantAttribute: { findUnique: jest.fn(async () => ({ id: 'link' })) },
      productOptionValueImage: {
        count: jest.fn(async () => (opts.hasDefault ? 1 : 0)),
        upsert: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const assetUrls = { resolve: jest.fn(async (k: string) => `https://cdn.test/${k}`) };
    const service = new ProductsService(prisma as never, assetUrls as never, null as never, null as never, null as never, null as never);
    return { service, prisma };
  }

  it('sets a language photo on top of a default', async () => {
    const { service, prisma } = make({ media: [img('shared'), img('fr-only', ['fr'])], hasDefault: true });
    await expect(service.setProductOptionImage('p1', 'black', 'fr-only', 'fr')).resolves.toMatchObject({ locale: 'fr', mediaKey: 'fr-only' });
    expect(prisma.productOptionValueImage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId_optionValueId_locale: { productId: 'p1', optionValueId: 'black', locale: 'fr' } } }),
    );
  });

  it('refuses a language photo before there is a default', async () => {
    const { service } = make({ media: [img('shared')], hasDefault: false });
    await expect(service.setProductOptionImage('p1', 'black', 'shared', 'fr')).rejects.toThrow(/default swatch photo first/);
  });

  it('refuses a default limited to some languages, and a language photo its gallery hides', async () => {
    const { service } = make({ media: [img('fr-only', ['fr'])], hasDefault: true });
    await expect(service.setProductOptionImage('p1', 'black', 'fr-only', undefined)).rejects.toThrow(BadRequestException);
    await expect(service.setProductOptionImage('p1', 'black', 'fr-only', 'de')).rejects.toThrow(/not shown in DE/);
  });

  it('refuses an unknown language', async () => {
    const { service } = make({ media: [img('shared')], hasDefault: true });
    await expect(service.setProductOptionImage('p1', 'black', 'shared', 'xx')).rejects.toThrow(/Unknown language/);
  });

  it('removes one language photo, or the default with every language photo', async () => {
    const { service, prisma } = make({ media: [] });
    await service.removeProductOptionImage('p1', 'black', 'fr');
    expect(prisma.productOptionValueImage.deleteMany).toHaveBeenLastCalledWith({ where: { productId: 'p1', optionValueId: 'black', locale: 'fr' } });
    await service.removeProductOptionImage('p1', 'black', undefined);
    expect(prisma.productOptionValueImage.deleteMany).toHaveBeenLastCalledWith({ where: { productId: 'p1', optionValueId: 'black' } });
  });
});

describe('ProductsService — gallery saves keep swatch photos visible', () => {
  type Guard = (productId: string, media: ProductMediaItem[]) => Promise<void>;
  function make(swatches: Array<{ mediaKey: string; locale: string; name: string }>) {
    const prisma = {
      productVariant: { findMany: jest.fn(async () => []) },
      productOptionValueImage: {
        findMany: jest.fn(async ({ where }: { where: { mediaKey: { in: string[] } } }) =>
          swatches
            .filter((s) => where.mediaKey.in.includes(s.mediaKey))
            .map((s) => ({ mediaKey: s.mediaKey, locale: s.locale, optionValue: { value: s.name, displayValue: null } })),
        ),
      },
    };
    const service = new ProductsService(prisma as never, null as never, null as never, null as never, null as never, null as never);
    return (service as unknown as { assertVariantPhotosShared: Guard }).assertVariantPhotosShared.bind(service);
  }

  it('lets a language’s swatch photo be limited to that language', async () => {
    const guard = make([{ mediaKey: 'cap-fr', locale: 'fr', name: 'Black' }]);
    await expect(guard('p1', [img('cap-fr', ['fr', 'pt'])])).resolves.toBeUndefined();
  });

  it('refuses hiding a swatch photo from its own language, naming it', async () => {
    const guard = make([{ mediaKey: 'cap-fr', locale: 'fr', name: 'Black' }]);
    await expect(guard('p1', [img('cap-fr', ['de'])])).rejects.toThrow(/FR swatch photo for "Black"/);
  });

  it('refuses limiting a default swatch photo at all', async () => {
    const guard = make([{ mediaKey: 'cap', locale: '', name: 'Black' }]);
    await expect(guard('p1', [img('cap', ['fr'])])).rejects.toThrow(/swatch photo for "Black"/);
  });
});
