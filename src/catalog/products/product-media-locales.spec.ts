import { BadRequestException } from '@nestjs/common';
import { deriveLegacyImageFields, languageSpecificMediaKeys, mediaForLocale, normalizeMedia } from './product-content.util';
import { ProductMediaItem } from '../types/product-content.types';

const img = (key: string, extra: Partial<ProductMediaItem> = {}): ProductMediaItem => ({ key, type: 'image', ...extra });

describe('gallery photos limited to languages', () => {
  describe('normalizeMedia', () => {
    it('keeps the languages, de-duplicated and in storefront order', () => {
      const [m] = normalizeMedia([{ key: 'a', type: 'image', locales: ['pt', 'fr', 'pt'] }]);
      expect(m.locales).toEqual(['fr', 'pt']);
    });

    it('treats no languages, or all of them, as shared', () => {
      const [none, all] = normalizeMedia([
        { key: 'a', type: 'image', locales: [] },
        { key: 'b', type: 'image', locales: ['en', 'fr', 'es', 'it', 'de', 'nl', 'pl', 'pt'] },
      ]);
      expect(none.locales).toBeUndefined();
      expect(all.locales).toBeUndefined();
    });

    it('refuses a featured photo limited to some languages', () => {
      expect(() => normalizeMedia([{ key: 'a', type: 'image', isFeatured: true, locales: ['fr'] }])).toThrow(BadRequestException);
    });
  });

  describe('mediaForLocale', () => {
    const gallery = [img('shared-1'), img('fr-only', { locales: ['fr'] }), img('en-pt', { locales: ['en', 'pt'] }), img('shared-2')];

    it('shows the shared photos and the language’s own, in the admin’s order', () => {
      expect(mediaForLocale(gallery, 'fr').map((m) => m.key)).toEqual(['shared-1', 'fr-only', 'shared-2']);
      expect(mediaForLocale(gallery, 'pt').map((m) => m.key)).toEqual(['shared-1', 'en-pt', 'shared-2']);
    });

    it('reads no language as the storefront default (English)', () => {
      expect(mediaForLocale(gallery, undefined).map((m) => m.key)).toEqual(['shared-1', 'en-pt', 'shared-2']);
    });

    it('gives a language with nothing to see the whole gallery instead of none', () => {
      const onlyFr = [img('a', { locales: ['fr'] }), img('b', { locales: ['fr'] })];
      expect(mediaForLocale(onlyFr, 'de').map((m) => m.key)).toEqual(['a', 'b']);
    });
  });

  describe('deriveLegacyImageFields', () => {
    it('builds the card photo and hover strip from shared photos only', () => {
      const out = deriveLegacyImageFields([img('fr-first', { locales: ['fr'] }), img('shared-1'), img('shared-2')]);
      expect(out.featuredImageKey).toBe('shared-1');
      expect(out.galleryImageKeys).toEqual(['shared-2']);
    });
  });

  it('languageSpecificMediaKeys lists only the limited photos', () => {
    expect([...languageSpecificMediaKeys([img('a'), img('b', { locales: ['de'] })])]).toEqual(['b']);
  });
});
