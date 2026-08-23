import { z } from 'zod';

export const AudienceSchema = z.object({
  segment: z.enum([
    'all',
    'fr',
    'en',
    'customers',
    'non_customers',
    'purchasers',
    'newsletter_only',
    'tags',
  ]),
  tags: z.array(z.string().max(50)).optional(),
});
export type AudienceDefinition = z.infer<typeof AudienceSchema>;

const CampaignTypeSchema = z.enum([
  'newsletter',
  'promotion',
  'new_arrivals',
  'flash_sale',
  'category',
  'abandoned_cart',
  'product_launch',
  'announcement',
]);

export const CreateCampaignSchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.string().min(1).max(250),
  previewText: z.string().max(250).optional(),
  htmlContent: z.string().optional(),
  audience: AudienceSchema.optional(),
  type: CampaignTypeSchema.optional(),
  tags: z.array(z.string().max(50)).optional(),
});
export type CreateCampaignDto = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = CreateCampaignSchema.partial();
export type UpdateCampaignDto = z.infer<typeof UpdateCampaignSchema>;

export const SendTestEmailSchema = z.object({
  to: z.string().email('Invalid email'),
});
export type SendTestEmailDto = z.infer<typeof SendTestEmailSchema>;

export const ScheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime(),
});
export type ScheduleCampaignDto = z.infer<typeof ScheduleCampaignSchema>;

export const AudiencePreviewSchema = z.object({
  audience: AudienceSchema,
});
export type AudiencePreviewDto = z.infer<typeof AudiencePreviewSchema>;
