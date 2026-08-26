import { z } from 'zod';

/** Locale-less storefront path ("/shop") or an absolute URL. */
const HrefSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), {
    message: 'Link must start with "/" or be an absolute http(s) URL',
  });

export const CreateHeroSlideSchema = z.object({
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  /** Null renders the gradient treatment instead of a banner photo. */
  imageKey: z.string().max(1000).nullish(),
  imageAlt: z.string().max(300).nullish(),
  eyebrow: z.string().max(120).nullish(),
  /** The card's copy as one HTML block from the admin's WYSIWYG. Unbounded
   *  like any other rich-text body — the markup, not the headline, sets the
   *  length. */
  content: z.string().nullish(),
  ctaLabel: z.string().max(80).nullish(),
  ctaHref: HrefSchema.nullish(),
  ctaSecondaryLabel: z.string().max(80).nullish(),
  ctaSecondaryHref: HrefSchema.nullish(),
});
export type CreateHeroSlideDto = z.infer<typeof CreateHeroSlideSchema>;

/**
 * Only `sortOrder` and `isActive` are re-declared, because those are the two
 * fields the create schema gives a `.default()`. `.partial()` keeps a default
 * alive on an absent key, so deriving the whole thing from the create schema
 * made every single-field PATCH also send `sortOrder: 0` and `isActive: true` —
 * editing a slide moved it to the top of the carousel and un-hid it. The rest
 * are `.nullish()` already and partial cleanly.
 */
export const UpdateHeroSlideSchema = CreateHeroSlideSchema.partial().extend({
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateHeroSlideDto = z.infer<typeof UpdateHeroSlideSchema>;

export const ReorderHeroSlidesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type ReorderHeroSlidesDto = z.infer<typeof ReorderHeroSlidesSchema>;
