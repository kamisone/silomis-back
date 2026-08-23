import { z } from 'zod';

export const CreatePromotionSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().nullish(),
  marketingLabel: z.string().max(300).nullish(),
  bannerText: z.string().nullish(),
  trigger: z.enum(['automatic', 'coupon']).default('automatic'),
  code: z.string().max(100).nullish(),
  discountType: z.enum(['percentage', 'fixed_amount', 'free_shipping']),
  discountValue: z.number().int().default(0),
  scope: z.enum(['site_wide', 'category', 'product']).default('site_wide'),
  minOrderCents: z.number().int().min(0).nullish(),
  maxUsesTotal: z.number().int().min(1).nullish(),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  campaignId: z.string().uuid().nullish(),
});
export type CreatePromotionDto = z.infer<typeof CreatePromotionSchema>;

export const UpdatePromotionSchema = CreatePromotionSchema.partial();
export type UpdatePromotionDto = z.infer<typeof UpdatePromotionSchema>;

export const AddCategoryLinkSchema = z.object({
  categoryId: z.string().uuid(),
});
export type AddCategoryLinkDto = z.infer<typeof AddCategoryLinkSchema>;

export const AddProductLinkSchema = z.object({
  productId: z.string().uuid(),
});
export type AddProductLinkDto = z.infer<typeof AddProductLinkSchema>;
