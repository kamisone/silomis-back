import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  seoTitle: z.string().max(300).nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  imageKey: z.string().max(1000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CreateCategorySchema.partial();
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;
