import { z } from 'zod';

export const CreatePriceRuleSchema = z
  .object({
    name: z.string().min(1).max(300),
    type: z.enum(['percentage_off', 'fixed_off', 'override']),
    value: z.number().int().min(0),
    scope: z.enum(['variant', 'product', 'global']).default('product'),
    variantId: z.string().uuid().nullish(),
    productId: z.string().uuid().nullish(),
    minQty: z.number().int().min(1).default(1),
    priority: z.number().int().default(0),
    isActive: z.boolean().default(true),
    startsAt: z.coerce.date().nullish(),
    expiresAt: z.coerce.date().nullish(),
  })
  .refine((d) => d.type !== 'percentage_off' || d.value <= 100, { message: 'percentage_off value cannot exceed 100', path: ['value'] })
  .refine((d) => d.scope !== 'variant' || !!d.variantId, { message: 'variantId is required when scope is "variant"', path: ['variantId'] })
  .refine((d) => d.scope !== 'product' || !!d.productId, { message: 'productId is required when scope is "product"', path: ['productId'] });
export type CreatePriceRuleDto = z.infer<typeof CreatePriceRuleSchema>;

export const UpdatePriceRuleSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  type: z.enum(['percentage_off', 'fixed_off']).optional(),
  value: z.number().int().min(0).optional(),
  scope: z.enum(['variant', 'product', 'global']).optional(),
  variantId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  minQty: z.number().int().min(1).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
});
export type UpdatePriceRuleDto = z.infer<typeof UpdatePriceRuleSchema>;
