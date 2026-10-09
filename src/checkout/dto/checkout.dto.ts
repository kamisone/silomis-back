import { z } from 'zod';
import { isPlausiblePhone } from '../../common/utils/phone';

export const UpsertCheckoutSessionSchema = z.object({
  cartToken: z.string().uuid(),
  locale: z.string().max(10).optional().default('fr'),
  step: z.enum(['address', 'shipping', 'payment', 'complete']).optional(),
  orderId: z.string().uuid().nullish(),
  /**
   * The checkout form as the page holds it. Values are strings, except the
   * coupon (null until one is applied) and the SMS consent tick (a boolean).
   * This used to accept strings only, so every save carried `couponCode: null`
   * and was refused with a 400 — no session ever held the customer's details,
   * and abandoned-cart reminders could only find them on a draft order.
   */
  formSnapshot: z.record(z.string(), z.union([z.string().max(500), z.boolean(), z.null()])).nullish(),
});
export type UpsertCheckoutSessionDto = z.infer<
  typeof UpsertCheckoutSessionSchema
>;

export const InitiateCheckoutSchema = z
  .object({
    cartToken: z.string().uuid(),
    /** Email OR phone — at least one (see superRefine). An empty string is "not given". */
    email: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.email().max(300).nullish()),
    /** The customer's full name, as one field. */
    name: z.string().max(300).nullish(),
    /**
     * The two fields the form had before it asked for one name. Still read —
     * joined into `name` — so a checkout tab opened before the change, or a
     * resumed session, still goes through.
     */
    firstName: z.string().max(150).nullish(),
    lastName: z.string().max(150).nullish(),
    companyName: z.string().max(200).nullish(),
    phone: z.preprocess(
      (v) => (typeof v === 'string' && !v.trim() ? null : v),
      z.string().trim().max(50).refine(isPlausiblePhone, 'Invalid phone number').nullish(),
    ),
    line1: z.string().min(1).max(500),
    line2: z.string().max(500).nullish(),
    city: z.string().min(1).max(200),
    zip: z.string().min(1).max(20),
    country: z.string().length(2),
    /** Accepts whatever locale the storefront sends — falls back to 'fr' rather than rejecting an unrecognized one. */
    locale: z.string().max(10).optional().default('fr'),
    couponCode: z.string().max(100).nullish(),
    /** "Send me reminders by SMS" — consent to reminder texts (abandoned cart); only meaningful with a phone. */
    smsOptIn: z.boolean().optional().default(false),
    /** Meta Click ID / Browser ID cookies (_fbc / _fbp), read client-side — for Conversions API match quality only. */
    fbc: z.string().max(500).nullish(),
    fbp: z.string().max(500).nullish(),
    /** TikTok Click ID / Browser ID (ttclid / _ttp), read client-side — for Events API match quality only. */
    ttclid: z.string().max(500).nullish(),
    ttp: z.string().max(500).nullish(),
  })
  .superRefine((d, ctx) => {
    const hasName = (d.name?.trim().length ?? 0) >= 2 || (d.firstName?.trim() && d.lastName?.trim());
    const hasCompany = d.companyName?.trim();
    if (!hasName && !hasCompany) {
      ctx.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Provide your name or a company name',
      });
    }
    if (!d.email && !d.phone) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Provide an email address or a phone number',
      });
    }
  });
export type InitiateCheckoutDto = z.infer<typeof InitiateCheckoutSchema>;

/** Asking for a code to the phone typed at checkout. The country places a national number. */
export const SendPhoneCodeSchema = z.object({
  cartToken: z.string().uuid(),
  phone: z.string().trim().min(1).max(50),
  country: z.string().length(2),
  locale: z.string().max(10).optional().default('fr'),
});
export type SendPhoneCodeDto = z.infer<typeof SendPhoneCodeSchema>;

export const VerifyPhoneCodeSchema = z.object({
  cartToken: z.string().uuid(),
  phone: z.string().trim().min(1).max(50),
  country: z.string().length(2),
  code: z.string().trim().min(4).max(12),
});
export type VerifyPhoneCodeDto = z.infer<typeof VerifyPhoneCodeSchema>;
