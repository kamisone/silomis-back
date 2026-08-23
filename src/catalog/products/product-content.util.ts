import { randomUUID } from 'crypto';
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

/** At most one media item may be featured — clears any extras past the first. */
export function normalizeMedia(media: z.infer<typeof ProductMediaItemSchema>[]): ProductMediaItem[] {
  let featuredSeen = false;
  return media.map((m) => {
    if (!m.isFeatured) return m;
    if (featuredSeen) return { ...m, isFeatured: false };
    featuredSeen = true;
    return m;
  });
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
export function deriveLegacyImageFields(media: ProductMediaItem[]): { featuredImageKey: string | null; galleryImageKeys: string[] } {
  const images = media.filter((m) => m.type === 'image');
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
