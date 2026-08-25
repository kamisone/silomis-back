import { z } from 'zod';

export const CreateBlogPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  slug: z.string().min(1).max(500).optional(),
  excerpt: z.string().max(5000).nullable().optional(),
  content: z.string().nullable().optional(),
  featuredImageKey: z.string().max(1000).nullable().optional(),
  featuredImageAlt: z.string().max(300).nullable().optional(),
  seoTitle: z.string().max(500).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  canonicalUrl: z.string().url().nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  scheduledPublishAt: z.string().datetime().nullable().optional(),
  featured: z.boolean().optional(),
  authorName: z.string().max(200).nullable().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});
export type CreateBlogPostDto = z.infer<typeof CreateBlogPostSchema>;

export const UpdateBlogPostSchema = CreateBlogPostSchema.partial();
export type UpdateBlogPostDto = z.infer<typeof UpdateBlogPostSchema>;
