import { z } from 'zod';

/// One "product featured in this article" link. `sortOrder` is optional
/// because the array's own order is authoritative — the service assigns
/// indexes on write, so the client never has to keep the two in sync.
export const BlogProductRefSchema = z.object({
  productId: z.string().uuid(),
  label: z.string().max(300).nullable().optional(),
});
export type BlogProductRefDto = z.infer<typeof BlogProductRefSchema>;

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
  productRefs: z.array(BlogProductRefSchema).max(24).optional(),
});
export type CreateBlogPostDto = z.infer<typeof CreateBlogPostSchema>;

export const UpdateBlogPostSchema = CreateBlogPostSchema.partial();
export type UpdateBlogPostDto = z.infer<typeof UpdateBlogPostSchema>;
