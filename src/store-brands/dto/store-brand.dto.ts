import { z } from 'zod';

const FaqSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string().max(500),
  answer: z.string().max(5000),
  sortOrder: z.number().int().optional(),
  /** Hidden entries stay in the editor, off the FAQ page. */
  isActive: z.boolean().optional(),
});

/**
 * No `.default()` anywhere: UpdateStoreBrandSchema is `.partial()` of this,
 * and a partial keeps defaults — a PATCH of one field would reset the others.
 * Defaults live in the Prisma schema instead.
 */
export const CreateStoreBrandSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Slug must be lowercase, alphanumeric, hyphen-separated',
    ),
  name: z.string().trim().min(1).max(200),
  tagline: z.string().max(200).nullish(),
  logoKey: z.string().max(1000).nullish(),
  iconKey: z.string().max(1000).nullish(),
  footerText: z.string().max(2000).nullish(),
  supportEmail: z
    .string()
    .email()
    .max(300)
    .nullish()
    .or(z.literal('').transform(() => null)),
  supportPhone: z.string().max(50).nullish(),
  aboutTitle: z.string().max(300).nullish(),
  aboutHtml: z.string().nullish(),
  contactIntro: z.string().max(2000).nullish(),
  returnsNote: z.string().max(5000).nullish(),
  faqs: z.array(FaqSchema).max(50).optional(),
  seoTitle: z.string().max(300).nullish(),
  seoDescription: z.string().max(1000).nullish(),
  shareImageKey: z.string().max(1000).nullish(),
  isActive: z.boolean().optional(),
});
export type CreateStoreBrandDto = z.infer<typeof CreateStoreBrandSchema>;

export const UpdateStoreBrandSchema = CreateStoreBrandSchema.partial();
export type UpdateStoreBrandDto = z.infer<typeof UpdateStoreBrandSchema>;

export const LinkStoreBrandProductSchema = z.object({
  productId: z.string().uuid(),
});
export type LinkStoreBrandProductDto = z.infer<
  typeof LinkStoreBrandProductSchema
>;
