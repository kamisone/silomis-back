import { z } from 'zod';
import { TRUST_BADGE_ICON_NAMES } from '../../types/product-content.types';

// ── Content-block schemas (mirror the ProductXxx interfaces in catalog/types) ──

export const ProductMediaItemSchema = z.object({
  key: z.string().max(1000),
  type: z.enum(['image', 'video']),
  posterKey: z.string().max(1000).nullish(),
  altText: z.string().max(500).nullish(),
  isFeatured: z.boolean().optional(),
});

export const ProductInfoSectionSchema = z.object({
  /** Omit when adding a new section — the server assigns a stable id. */
  id: z.string().min(1).max(100).optional(),
  key: z.string().max(100).optional(),
  label: z.string().min(1).max(200),
  value: z.string().max(5000),
  sortOrder: z.number().int().optional(),
});

export const ProductTrustBadgeSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  icon: z.enum(TRUST_BADGE_ICON_NAMES),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).nullish(),
  link: z.string().max(2000).nullish(),
  sortOrder: z.number().int().optional(),
});

export const ProductFaqSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(5000),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const ProductZoomedImageSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  key: z.string().min(1).max(1000),
  altText: z.string().max(500).nullish(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const ProductPackageContentItemSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  key: z.string().min(1).max(1000),
  label: z.string().max(200).nullish(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const ProductStoryItemSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  key: z.string().min(1).max(1000),
  location: z.enum(['side', 'narrative']),
  altText: z.string().max(500).nullish(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16']).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const ProductSocialVideoSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  key: z.string().min(1).max(1000),
  title: z.string().max(300).nullish(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const ProductDocumentSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  storageKey: z.string().min(1).max(1000),
  originalFilename: z.string().min(1).max(500),
  sizeBytes: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
});

export const ProductPrivateLinkSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  label: z.string().max(200).nullish(),
  url: z.string().min(1).max(2000),
});

export const ProductUpsellTierSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// ── Product schemas ─────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().min(1).max(300).optional(),
  sku: z.string().max(200).nullish(),
  shortDescription: z.string().nullish(),
  description: z.string().nullish(),
  brand: z.string().max(300).nullish(),
  specifications: z.record(z.string(), z.unknown()).nullish(),
  infoSections: z.array(ProductInfoSectionSchema).optional(),
  trustBadges: z.array(ProductTrustBadgeSchema).optional(),
  faqs: z.array(ProductFaqSchema).optional(),
  zoomedImages: z.array(ProductZoomedImageSchema).optional(),
  packageContents: z.array(ProductPackageContentItemSchema).optional(),
  storyGallery: z.array(ProductStoryItemSchema).optional(),
  socialVideos: z.array(ProductSocialVideoSchema).optional(),
  socialVideosTitle: z.string().max(300).nullish(),
  /** Heading over the linked articles at the foot of the product page. */
  /** Draws the "New" badge on the storefront. */
  isNew: z.boolean().optional(),
  articlesTitle: z.string().max(300).nullish(),
  /** Blog posts to show on this product's page. Writes the same
   *  BlogProductReference join a post used to own from its own side, so a link
   *  made here is the same link — the article lists this product too. */
  articleIds: z.array(z.string().uuid()).max(24).optional(),
  storyNarrativeTitle: z.string().max(300).nullish(),
  documents: z.array(ProductDocumentSchema).optional(),
  /** Admin-only reference links (supplier pages, sourcing, etc.) — never sent to public consumers. */
  privateLinks: z.array(ProductPrivateLinkSchema).optional(),
  featuredImageKey: z.string().max(1000).nullish(),
  galleryImageKeys: z.array(z.string().max(1000)).optional(),
  media: z.array(ProductMediaItemSchema).optional(),
  featured: z.boolean().optional(),
  /** Demand-validation product: browsable and addable to cart, checkout refused. */
  isTestProduct: z.boolean().optional(),
  /** Any cart containing this product ships free, whatever the order total. */
  freeShipping: z.boolean().optional(),
  freeShippingDaysMin: z.number().int().min(0).max(365).nullish(),
  freeShippingDaysMax: z.number().int().min(0).max(365).nullish(),
  /** Paid shipping methods still offerable alongside the default free option (e.g. an express upgrade). */
  freeShippingUpgradeMethodIds: z.array(z.string().uuid()).optional(),
  /**
   * Methods this product is eligible for, among those requiring an explicit
   * opt-in. Only consulted for such methods, so omitting it never restricts
   * ordinary shipping.
   */
  shippingMethodIds: z.array(z.string().uuid()).optional(),
  primaryCategoryId: z.string().uuid().nullish(),
  categoryIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  /**
   * Product-level base price in cents. Effective variant price = basePriceCents +
   * sum(selected option value adjustments), unless a variant has an explicit override.
   */
  basePriceCents: z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).nullish(),
  initialStock: z.number().int().min(0).optional(),
  /** Quantity-based upselling ("buy N, pay X each"). Ignored entirely while false. */
  upsellingEnabled: z.boolean().optional(),
  /** Lets the customer pick a different variant per unit when buying more than one. */
  perUnitVariantChoice: z.boolean().optional(),
  upsellTiers: z
    .array(ProductUpsellTierSchema)
    .optional()
    .refine((tiers) => !tiers || new Set(tiers.map((t) => t.quantity)).size === tiers.length, {
      message: 'Two tiers cannot use the same quantity threshold',
    }),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.omit({ initialStock: true })
  .extend({ status: z.enum(['draft', 'active', 'archived', 'hidden']).optional() })
  .partial();
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

// ── Variant schemas ─────────────────────────────────────────────────────

export const CreateVariantSchema = z.object({
  /** Omit to auto-generate from product + options (e.g. TSHIRT-BLK-M) */
  sku: z.string().min(1).max(200).optional(),
  /** Omit to auto-generate from selected option values (e.g. "Black / M") */
  title: z.string().min(1).max(500).optional(),
  priceCents: z.number().int().min(0).nullish(),
  compareAtPriceCents: z.number().int().min(0).nullish(),
  barcode: z.string().max(200).nullish(),
  weightGrams: z.number().int().nullish(),
  mediaKeys: z.array(z.string().max(1000)).optional(),
  featuredMediaKey: z.string().max(1000).nullish(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  initialStock: z.number().int().min(0).optional(),
  options: z.array(z.object({ optionValueId: z.string().uuid() })).optional(),
});
export type CreateVariantDto = z.infer<typeof CreateVariantSchema>;

export const UpdateVariantSchema = CreateVariantSchema.omit({ initialStock: true }).partial();
export type UpdateVariantDto = z.infer<typeof UpdateVariantSchema>;

/** Storefront sort options. `curated` is the collection's own admin-defined
 * product order (CollectionProduct.sortOrder) and is only meaningful when a
 * `collection` filter is set — elsewhere it falls back to the default order. */
export const PRODUCT_SORTS = ['curated', 'newest', 'price_asc', 'price_desc', 'name_asc', 'rating_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductListFilter {
  status?: string;
  categoryId?: string;
  tagId?: string;
  /** Collection *slug* — products linked to it via CollectionProduct. */
  collection?: string;
  search?: string;
  featured?: boolean;
  isTestProduct?: boolean;
  ids?: string[];
  /** Only products the storefront would badge as discounted — the /sale
   * listing. See ProductsService.onSaleWhere for what "on sale" resolves to:
   * a compare-at price above the rendered price, or an active automatic
   * promotion scoped to the product or its category. */
  onSale?: boolean;
  /** Only products carrying the admin-set New flag — the /new listing. */
  isNew?: boolean;
  /** Bounds on the price the card actually renders (default variant's own
   * price, falling back to basePriceCents) — inclusive, in cents. */
  minPriceCents?: number;
  maxPriceCents?: number;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}
