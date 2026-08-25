import { z } from 'zod';

export const HOME_SECTION_TYPES = [
  'hero',
  'trust_bar',
  'categories',
  'featured_collections',
  'product_rail',
  'promo_banner',
  'blog_posts',
] as const;

export const HomeSectionTypeSchema = z.enum(HOME_SECTION_TYPES);
export type HomeSectionTypeDto = z.infer<typeof HomeSectionTypeSchema>;

/**
 * Per-type settings. Kept permissive on purpose — the storefront registry owns
 * the real shape of each type's config, and a section that gains an option
 * should not need a backend deploy to accept it. Unknown keys are preserved.
 */
export const HomeSectionConfigSchema = z
  .object({
    /** Item count for the list-bearing sections (categories, collections, rails, posts). */
    limit: z.number().int().min(1).max(24).optional(),
    /** product_rail: which catalogue query feeds the rail. */
    source: z.enum(['newest', 'featured']).optional(),
    /** product_rail: plain-text heading override; falls back to the localized default. */
    title: z.string().max(120).nullish(),
  })
  .passthrough();
export type HomeSectionConfig = z.infer<typeof HomeSectionConfigSchema>;

export const CreateHomeSectionSchema = z.object({
  type: HomeSectionTypeSchema,
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  config: HomeSectionConfigSchema.default({}),
});
export type CreateHomeSectionDto = z.infer<typeof CreateHomeSectionSchema>;

export const UpdateHomeSectionSchema = CreateHomeSectionSchema.partial();
export type UpdateHomeSectionDto = z.infer<typeof UpdateHomeSectionSchema>;

export const ReorderHomeSectionsSchema = z.object({
  /** Section ids in their new top-to-bottom order. */
  ids: z.array(z.string().uuid()).min(1),
});
export type ReorderHomeSectionsDto = z.infer<typeof ReorderHomeSectionsSchema>;

/**
 * The layout a fresh install renders before anyone touches the admin page, and
 * what "restore defaults" writes into the table. Mirrors the order the sections
 * were originally hard-coded in.
 */
export const DEFAULT_HOME_SECTIONS: Array<{ type: HomeSectionTypeDto; config: HomeSectionConfig }> = [
  { type: 'hero', config: {} },
  { type: 'trust_bar', config: {} },
  { type: 'categories', config: { limit: 6 } },
  { type: 'featured_collections', config: { limit: 3 } },
  { type: 'product_rail', config: { source: 'newest', limit: 8 } },
  { type: 'promo_banner', config: {} },
  { type: 'product_rail', config: { source: 'featured', limit: 8 } },
  { type: 'blog_posts', config: { limit: 3 } },
];
