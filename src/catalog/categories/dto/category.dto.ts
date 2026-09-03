import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  seoTitle: z.string().max(300).nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  imageKey: z.string().max(1000).nullable().optional(),
  bannerKey: z.string().max(1000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  /** Storefront price-range slider on this category's listing. */
  showPriceFilter: z.boolean().optional(),
  /** The slider's own endpoints, in cents — required together whenever the
   *  effective showPriceFilter is true; CategoriesService checks the pair
   *  together since a partial update can send one without the other. */
  priceFilterMinCents: z.number().int().min(0).nullable().optional(),
  priceFilterMaxCents: z.number().int().min(0).nullable().optional(),
});
export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CreateCategorySchema.partial();
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;
