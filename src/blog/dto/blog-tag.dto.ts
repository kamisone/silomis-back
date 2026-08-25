import { z } from 'zod';

export const CreateBlogTagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  slug: z.string().min(1).max(300).optional(),
});
export type CreateBlogTagDto = z.infer<typeof CreateBlogTagSchema>;

export const UpdateBlogTagSchema = CreateBlogTagSchema.partial();
export type UpdateBlogTagDto = z.infer<typeof UpdateBlogTagSchema>;
