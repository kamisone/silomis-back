import { z } from 'zod';

export const CreateBlogCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  slug: z.string().min(1).max(300).optional(),
  color: z
    .string()
    .length(7)
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type CreateBlogCategoryDto = z.infer<typeof CreateBlogCategorySchema>;

export const UpdateBlogCategorySchema = CreateBlogCategorySchema.partial();
export type UpdateBlogCategoryDto = z.infer<typeof UpdateBlogCategorySchema>;
