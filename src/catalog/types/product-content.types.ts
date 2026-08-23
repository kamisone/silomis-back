// Structured content blocks stored as jsonb columns on Product (see
// prisma/schema.prisma — Product.media/infoSections/trustBadges/... are Json
// fields typed loosely at the DB layer; these interfaces are the actual
// contract every reader/writer in the app agrees on).

/** A single media asset attached to a product (image or video). Order = gallery order. */
export interface ProductMediaItem {
  /** GCS storage key (image or video) */
  key: string;
  type: 'image' | 'video';
  /** Optional poster/thumbnail image key — videos only */
  posterKey?: string | null;
  altText?: string | null;
  /** At most one item across the array should be true */
  isFeatured?: boolean;
}

/** ProductMediaItem with resolved URLs, returned by the API. */
export interface ResolvedProductMediaItem extends ProductMediaItem {
  url: string;
  posterUrl: string | null;
}

/** A structured, translatable text block shown on the product page (Composition, Care, ...). */
export interface ProductInfoSection {
  id: string;
  key: string;
  label: string;
  value: string;
  sortOrder: number;
}

export const TRUST_BADGE_ICON_NAMES = [
  'Lock', 'ShieldCheck', 'Truck', 'PackageCheck', 'RotateCcw', 'CreditCard',
  'BadgeCheck', 'Award', 'Clock', 'Headset', 'Gift', 'Leaf', 'Recycle', 'Globe',
] as const;
export type TrustBadgeIconName = (typeof TRUST_BADGE_ICON_NAMES)[number];

/** A small icon + title/subtitle "trust signal" shown in the PDP trust row. */
export interface ProductTrustBadge {
  id: string;
  icon: TrustBadgeIconName;
  title: string;
  subtitle?: string;
  link?: string;
  sortOrder: number;
}

/** A product-specific FAQ entry — also used to generate FAQPage structured data. */
export interface ProductFaq {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

/** A downloadable PDF document (notice, fiche technique, ...). */
export interface ProductDocument {
  id: string;
  title: string;
  storageKey: string;
  originalFilename: string;
  sizeBytes: number;
  sortOrder: number;
}

/** A zoomed/lifestyle gallery image — image only, no copy. */
export interface ProductZoomedImage {
  id: string;
  key: string;
  altText?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** A "what's in the box" thumbnail — one included item photo + optional caption. */
export interface ProductPackageContentItem {
  id: string;
  key: string;
  label?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export type StoryGalleryLocation = 'side' | 'narrative';
export type StoryImageAspectRatio = '1:1' | '16:9' | '9:16';

/** A Story Gallery image — `side` items are image-only, `narrative` items pair image + copy. */
export interface ProductStoryItem {
  id: string;
  key: string;
  location: StoryGalleryLocation;
  altText?: string | null;
  aspectRatio: StoryImageAspectRatio;
  title: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

/** A social/reels-style video, shown in a vertical carousel. */
export interface ProductSocialVideo {
  id: string;
  key: string;
  title?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * An internal reference link (supplier listing, sourcing page, ...) for admin
 * use only. Must be stripped explicitly wherever a product is serialized for
 * a public consumer — see ProductService.stripPrivateFields.
 */
export interface ProductPrivateLink {
  id: string;
  label: string;
  url: string;
}

/** A quantity-price tier — "buy N, pay X each". Only applies when product.upsellingEnabled. */
export interface ProductUpsellTier {
  id: string;
  quantity: number;
  unitPriceCents: number;
  active: boolean;
  sortOrder: number;
}
