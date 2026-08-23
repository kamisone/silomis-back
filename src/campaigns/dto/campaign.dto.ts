import { z } from 'zod';

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().nullish(),
  bannerImageKey: z.string().max(1000).nullish(),
  startsAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  isActive: z.boolean().default(true),
});
export type CreateCampaignDto = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = CreateCampaignSchema.partial();
export type UpdateCampaignDto = z.infer<typeof UpdateCampaignSchema>;
