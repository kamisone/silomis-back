import { z } from 'zod';

export const UpsertCheckoutSessionSchema = z.object({
  cartToken: z.string().uuid(),
  locale: z.string().max(10).optional().default('fr'),
  step: z.enum(['address', 'shipping', 'payment', 'complete']).optional(),
  orderId: z.string().uuid().nullish(),
  formSnapshot: z.record(z.string(), z.string()).nullish(),
});
export type UpsertCheckoutSessionDto = z.infer<typeof UpsertCheckoutSessionSchema>;

export const InitiateCheckoutSchema = z
  .object({
    cartToken: z.string().uuid(),
    email: z.email().max(300),
    firstName: z.string().max(150).nullish(),
    lastName: z.string().max(150).nullish(),
    companyName: z.string().max(200).nullish(),
    phone: z.string().max(50).nullish(),
    line1: z.string().min(1).max(500),
    line2: z.string().max(500).nullish(),
    city: z.string().min(1).max(200),
    zip: z.string().min(1).max(20),
    country: z.string().length(2),
    /** Accepts whatever locale the storefront sends — falls back to 'fr' rather than rejecting an unrecognized one. */
    locale: z.string().max(10).optional().default('fr'),
    couponCode: z.string().max(100).nullish(),
  })
  .superRefine((d, ctx) => {
    const hasName = d.firstName?.trim() && d.lastName?.trim();
    const hasCompany = d.companyName?.trim();
    if (!hasName && !hasCompany) {
      ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'Provide first & last name or a company name' });
    }
  });
export type InitiateCheckoutDto = z.infer<typeof InitiateCheckoutSchema>;
