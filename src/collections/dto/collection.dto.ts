import { z } from 'zod';

export const CreateCollectionSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric, hyphen-separated'),
  name: z.string().min(1).max(500),
  description: z.string().nullish(),
  imageKey: z.string().max(1000).nullish(),
  seoTitle: z.string().max(500).nullish(),
  seoDescription: z.string().nullish(),
  metaKeywords: z.string().max(500).nullish(),
  heroTitle: z.string().max(255).nullish(),
  heroSubtitle: z.string().nullish(),
  heroCopy: z.string().nullish(),
  bodyHtml: z.string().nullish(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  publishedAt: z.coerce.date().nullish(),
});
export type CreateCollectionDto = z.infer<typeof CreateCollectionSchema>;

export const UpdateCollectionSchema = CreateCollectionSchema.partial();
export type UpdateCollectionDto = z.infer<typeof UpdateCollectionSchema>;

export const AddCollectionProductSchema = z.object({
  productId: z.string().uuid(),
});
export type AddCollectionProductDto = z.infer<typeof AddCollectionProductSchema>;

export const ReorderCollectionProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
});
export type ReorderCollectionProductsDto = z.infer<typeof ReorderCollectionProductsSchema>;
