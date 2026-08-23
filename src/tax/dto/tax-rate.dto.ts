import { z } from 'zod';

export const CreateTaxRateSchema = z.object({
  countryCode: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .nullish(),
  categoryId: z.string().uuid().nullish(),
  ratePct: z.number().min(0).max(100),
  label: z.string().min(1).max(100).default('VAT'),
  isActive: z.boolean().default(true),
});
export type CreateTaxRateDto = z.infer<typeof CreateTaxRateSchema>;

export const UpdateTaxRateSchema = CreateTaxRateSchema.partial();
export type UpdateTaxRateDto = z.infer<typeof UpdateTaxRateSchema>;
