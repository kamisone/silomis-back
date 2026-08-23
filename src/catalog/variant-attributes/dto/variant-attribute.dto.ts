import { z } from 'zod';

export const CreateVariantAttributeSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  adminLabel: z.string().max(200).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  displayType: z.enum(['swatch', 'button', 'dropdown']).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CreateVariantAttributeDto = z.infer<typeof CreateVariantAttributeSchema>;

export const UpdateVariantAttributeSchema = CreateVariantAttributeSchema.partial();
export type UpdateVariantAttributeDto = z.infer<typeof UpdateVariantAttributeSchema>;

export const CreateOptionValueSchema = z.object({
  value: z.string().min(1).max(200),
  displayValue: z.string().max(200).nullable().optional(),
  swatchValue: z.string().max(500).nullable().optional(),
  swatchType: z.enum(['color', 'image']).nullable().optional(),
  priceAdjustmentCents: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CreateOptionValueDto = z.infer<typeof CreateOptionValueSchema>;

export const UpdateOptionValueSchema = CreateOptionValueSchema.partial();
export type UpdateOptionValueDto = z.infer<typeof UpdateOptionValueSchema>;
