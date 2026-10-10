import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import {
  ProductDocument,
  ProductFaq,
  ProductInfoSection,
  ProductMediaItem,
  ProductPackageContentItem,
  ProductPrivateLink,
  ProductSocialVideo,
  ProductStoryItem,
  ProductTrustBadge,
  ProductUpsellTier,
  ProductZoomedImage,
  STOREFRONT_DEFAULT_LOCALE,
  STOREFRONT_LOCALES,
  StorefrontLocale,
} from '../types/product-content.types';
import {
  ProductDocumentSchema,
  ProductFaqSchema,
  ProductInfoSectionSchema,
  ProductMediaItemSchema,
  ProductPackageContentItemSchema,
  ProductPrivateLinkSchema,
  ProductSocialVideoSchema,
  ProductStoryItemSchema,
  ProductTrustBadgeSchema,
  ProductUpsellTierSchema,
  ProductZoomedImageSchema,
} from './dto/product.dto';
import { z } from 'zod';

/**
 * Cleans a gallery before it is stored:
 *  - at most one item is featured (extras past the first are cleared);
 *  - `locales` is de-duplicated and put in STOREFRONT_LOCALES order, and
 *    dropped when it is empty or names every language — both mean "shared";
 *  - a featured item must be shared. It is the product's face on cards, in
 *    the cart and in link previews, none of which pick a photo by language.
 */
export function normalizeMedia(media: z.infer<typeof ProductMediaItemSchema>[]): ProductMediaItem[] {
  let featuredSeen = false;
  return media.map((raw) => {
    const { locales: rawLocales, ...rest } = raw;
    const picked = new Set(rawLocales ?? []);
    const locales = STOREFRONT_LOCALES.filter((l) => picked.has(l));
    const m: ProductMediaItem = locales.length > 0 && locales.length < STOREFRONT_LOCALES.length ? { ...rest, locales } : rest;
    if (!m.isFeatured) return m;
    if (featuredSeen) return { ...m, isFeatured: false };
    if (m.locales) throw new BadRequestException('The featured photo must be shown in all languages — set it to "All languages" or feature another photo.');
    featuredSeen = true;
    return m;
  });
}

/**
 * The storefront language a request is for. No `lang` — or one the storefront
 * does not have — is the storefront default, which is how the storefront
 * itself reads it (it omits `?lang=` for its default).
 */
export function storefrontLocale(lang?: string | null): StorefrontLocale {
  const base = (lang ?? '').toLowerCase().split('-')[0];
  return (STOREFRONT_LOCALES as readonly string[]).includes(base) ? (base as StorefrontLocale) : STOREFRONT_DEFAULT_LOCALE;
}

// ── Swatch photos per language ──────────────────────────────────────────
// ProductOptionValueImage.locale: "" is the default shown in every language;
// a storefront locale replaces it on that language's pages.

/** "" for the default, a storefront locale, or null for anything else. */
export function parseSwatchLocale(raw?: string | null): '' | StorefrontLocale | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return '';
  return (STOREFRONT_LOCALES as readonly string[]).includes(value) ? (value as StorefrontLocale) : null;
}

/** One option's swatch photo for a language: its own if it has one, else the default. */
export function pickSwatchPhoto<T extends { locale?: string | null }>(rows: T[], lang?: string | null): T | undefined {
  const locale = storefrontLocale(lang);
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => !r.locale);
}

/**
 * Groups swatch photo rows by option and picks each option's photo for a
 * language — the shape every storefront reader needs. Keyed by `keyOf(row)`
 * (the option id, or product + option for a page of cards).
 */
export function swatchPhotosForLocale<T extends { locale?: string | null }>(rows: T[], keyOf: (row: T) => string, lang?: string | null): Map<string, T> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const out = new Map<string, T>();
  for (const [key, group] of groups) {
    const picked = pickSwatchPhoto(group, lang);
    if (picked) out.set(key, picked);
  }
  return out;
}

/**
 * Whether a swatch photo can serve `locale`: the default ("") must be a photo
 * every language's gallery shows — it is everyone's fallback, and the cart
 * line and share preview of any language — and a language's own photo must
 * be one that language's gallery shows. A key that is not a gallery photo at
 * all has nothing to check against and is allowed (older swatches).
 */
export function swatchPhotoFitsLocale(media: ProductMediaItem[], mediaKey: string, locale: '' | StorefrontLocale): boolean {
  const item = media.find((m) => m.key === mediaKey);
  if (!item || isSharedMedia(item)) return true;
  return locale !== '' && item.locales!.includes(locale);
}

/** Whether a gallery item is shown in every language. */
export function isSharedMedia(m: ProductMediaItem): boolean {
  return !m.locales?.length;
}

/** Keys of the gallery items limited to some languages. */
export function languageSpecificMediaKeys(media: ProductMediaItem[]): Set<string> {
  return new Set(media.filter((m) => !isSharedMedia(m)).map((m) => m.key));
}

/**
 * The gallery as a storefront page in `lang` shows it: the shared items plus
 * those limited to `lang`, in the admin's order. No `lang` is the
 * storefront's default language. A language left with nothing — every photo
 * limited to other languages — gets the whole gallery rather than an empty
 * one: a product page without photos is worse than one in the wrong language.
 */
export function mediaForLocale(media: ProductMediaItem[], lang?: string | null): ProductMediaItem[] {
  const locale = storefrontLocale(lang);
  const visible = media.filter((m) => isSharedMedia(m) || m.locales!.includes(locale));
  return visible.length ? visible : media;
}

/** Assigns stable ids to new sections and re-derives sortOrder from array position. */
export function normalizeInfoSections(sections: z.infer<typeof ProductInfoSectionSchema>[]): ProductInfoSection[] {
  return sections.map((s, i) => ({ id: s.id ?? randomUUID(), key: s.key ?? 'custom', label: s.label, value: s.value, sortOrder: i }));
}

export function normalizeTrustBadges(badges: z.infer<typeof ProductTrustBadgeSchema>[]): ProductTrustBadge[] {
  return badges.map((b, i) => ({
    id: b.id ?? randomUUID(),
    icon: b.icon,
    title: b.title,
    subtitle: b.subtitle?.trim() ? b.subtitle : undefined,
    link: b.link?.trim() ? b.link : undefined,
    sortOrder: i,
  }));
}

export function normalizeFaqs(faqs: z.infer<typeof ProductFaqSchema>[]): ProductFaq[] {
  return faqs.map((f, i) => ({ id: f.id ?? randomUUID(), question: f.question, answer: f.answer, sortOrder: i, isActive: f.isActive ?? true }));
}

export function normalizeZoomedImages(items: z.infer<typeof ProductZoomedImageSchema>[]): ProductZoomedImage[] {
  return items.map((img, i) => ({
    id: img.id ?? randomUUID(),
    key: img.key,
    altText: img.altText?.trim() ? img.altText : null,
    sortOrder: i,
    isActive: img.isActive ?? true,
  }));
}

export function normalizePackageContents(items: z.infer<typeof ProductPackageContentItemSchema>[]): ProductPackageContentItem[] {
  return items.map((img, i) => ({
    id: img.id ?? randomUUID(),
    key: img.key,
    label: img.label?.trim() ? img.label : null,
    sortOrder: i,
    isActive: img.isActive ?? true,
  }));
}

/** sortOrder is derived independently within each location — side and narrative are ordered separately. */
export function normalizeStoryGallery(items: z.infer<typeof ProductStoryItemSchema>[]): ProductStoryItem[] {
  const counters: Record<string, number> = { side: 0, narrative: 0 };
  return items.map((s) => ({
    id: s.id ?? randomUUID(),
    key: s.key,
    location: s.location,
    altText: s.altText?.trim() ? s.altText : null,
    aspectRatio: s.aspectRatio ?? '1:1',
    title: s.title ?? '',
    description: s.description ?? '',
    sortOrder: counters[s.location]++,
    isActive: s.isActive ?? true,
  }));
}

export function normalizeSocialVideos(items: z.infer<typeof ProductSocialVideoSchema>[]): ProductSocialVideo[] {
  return items.map((v, i) => ({ id: v.id ?? randomUUID(), key: v.key, title: v.title?.trim() ? v.title : null, sortOrder: i, isActive: v.isActive ?? true }));
}

export function normalizeUpsellTiers(tiers: z.infer<typeof ProductUpsellTierSchema>[]): ProductUpsellTier[] {
  return tiers.map((t, i) => ({ id: t.id ?? randomUUID(), quantity: t.quantity, unitPriceCents: t.unitPriceCents, active: t.active ?? true, sortOrder: t.sortOrder ?? i }));
}

export function normalizeDocuments(docs: z.infer<typeof ProductDocumentSchema>[]): ProductDocument[] {
  return docs.map((d, i) => ({ id: d.id, title: d.title, storageKey: d.storageKey, originalFilename: d.originalFilename, sizeBytes: d.sizeBytes, sortOrder: d.sortOrder ?? i }));
}

export function normalizeLinks(links: z.infer<typeof ProductPrivateLinkSchema>[]): ProductPrivateLink[] {
  return links.map((l) => ({ id: l.id ?? randomUUID(), label: l.label?.trim() ?? '', url: l.url }));
}

/** Derives the legacy featuredImageKey/galleryImageKeys columns from the image-type subset of `media`. */
/**
 * The legacy featured/gallery columns, which feed product cards, their hover
 * switchers, the cart, search and feeds — none of them language-aware. So
 * they are built from shared images only: a one-language photo never becomes
 * the product's face, and the hover strip never shows a photo in the wrong
 * language.
 */
export function deriveLegacyImageFields(media: ProductMediaItem[]): { featuredImageKey: string | null; galleryImageKeys: string[] } {
  const images = media.filter((m) => m.type === 'image' && isSharedMedia(m));
  const featured = images.find((m) => m.isFeatured) ?? images[0];
  return {
    featuredImageKey: featured?.key ?? null,
    galleryImageKeys: images.filter((m) => m !== featured).map((m) => m.key),
  };
}

// ── Variant naming helpers ────────────────────────────────────────────────

interface OptionValueLike {
  id: string;
  value: string;
  displayValue: string | null;
}

/** Sorted so order of selection doesn't matter. Null for zero-option (single-SKU) variants. */
export function buildCombinationHash(optionValueIds: string[]): string | null {
  if (!optionValueIds.length) return null;
  return [...optionValueIds].sort().join('|');
}

/** "Black / M" — caller must pass values pre-sorted by attribute.sortOrder. */
export function buildVariantTitle(sorted: OptionValueLike[]): string {
  return sorted.map((v) => v.displayValue ?? v.value).join(' / ');
}

/** "black-m" — URL-safe slug from option values. */
export function buildVariantSlug(sorted: OptionValueLike[]): string | null {
  if (!sorted.length) return null;
  return sorted.map((v) => (v.displayValue ?? v.value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).join('-');
}

/** "TSHIRT" + Black/M → "TSHIRT-BLK-M" */
export function buildVariantSkuBase(product: { sku: string | null; slug: string }, sorted: OptionValueLike[]): string {
  const prefix = (product.sku ?? product.slug).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!sorted.length) return prefix;
  const parts = sorted.map((v) => v.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
  return [prefix, ...parts].join('-');
}
