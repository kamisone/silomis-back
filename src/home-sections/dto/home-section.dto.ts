import { z } from 'zod';

export const HOME_SECTION_TYPES = [
  'hero',
  'trust_bar',
  'categories',
  'featured_collections',
  'product_rail',
  'promo_banner',
  'offer_banners',
  'blog_posts',
  // Editorial blocks: no catalogue query behind them, they render the copy the
  // admin typed into `config`.
  'section_heading',
  'separator',
  'seo_text',
] as const;

export const HomeSectionTypeSchema = z.enum(HOME_SECTION_TYPES);
export type HomeSectionTypeDto = z.infer<typeof HomeSectionTypeSchema>;

/**
 * Copy the admin typed, keyed by locale — `{ en: 'New in', fr: 'Nouveautés' }`.
 *
 * The locale keys are deliberately not constrained to a list: adding a language
 * is a frontend concern, and a backend enum here would reject a valid new locale
 * until this file caught up. A bare string is still accepted for rows written
 * before the fields became translatable.
 */
export const LocalizedTextSchema = z.union([
  z.string().max(120),
  z.record(z.string(), z.string().max(120)),
]);

/**
 * Per-type settings. Kept permissive on purpose — the storefront registry owns
 * the real shape of each type's config, and a section that gains an option
 * should not need a backend deploy to accept it. Unknown keys are preserved.
 *
 * That includes the editorial blocks' copy, which is stored as a
 * `{ en: '…', fr: '…' }` map per field rather than going through
 * EntityTranslation: these sections have no other columns to translate, so a
 * row in the translations table would exist purely to hold a JSON field's
 * sibling. The storefront falls back to English, then to any locale that has
 * text, so a half-translated block still renders.
 */
export const HomeSectionConfigSchema = z
  .object({
    /** Item count for the list-bearing sections (categories, collections, rails, posts). */
    limit: z.number().int().min(1).max(24).optional(),
    /**
     * product_rail: which catalogue query feeds the rail. `manual` means the
     * rail renders exactly `productIds`, in that order, and ignores `limit`.
     */
    source: z.enum(['newest', 'featured', 'on_sale', 'manual']).optional(),
    /** Heading override for any list section; falls back to the localized default. */
    title: LocalizedTextSchema.nullish(),
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

/**
 * Spelled out rather than `CreateHomeSectionSchema.partial()`.
 *
 * `.partial()` makes each key optional but leaves its `.default()` in place, so
 * a PATCH of `{ config }` parsed through the create schema also emitted
 * `sortOrder: 0` and `isActive: true` — every settings change quietly moved the
 * section to the top of the page and un-hid it, and toggling visibility sent
 * `config: {}` and wiped the section's whole configuration.
 *
 * A partial update must carry only the keys the caller actually sent, so the
 * fields are listed here without defaults.
 */
export const UpdateHomeSectionSchema = z.object({
  type: HomeSectionTypeSchema.optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  config: HomeSectionConfigSchema.optional(),
});
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
