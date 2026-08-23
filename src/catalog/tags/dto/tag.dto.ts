import { z } from 'zod';

export const CreateTagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z.string().min(1).max(200).optional(),
});
export type CreateTagDto = z.infer<typeof CreateTagSchema>;

export const UpdateTagSchema = CreateTagSchema.partial();
export type UpdateTagDto = z.infer<typeof UpdateTagSchema>;
