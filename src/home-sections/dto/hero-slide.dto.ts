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

export const UpdateHeroSlideSchema = CreateHeroSlideSchema.partial();
export type UpdateHeroSlideDto = z.infer<typeof UpdateHeroSlideSchema>;

export const ReorderHeroSlidesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type ReorderHeroSlidesDto = z.infer<typeof ReorderHeroSlidesSchema>;
