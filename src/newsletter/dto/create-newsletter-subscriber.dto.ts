import { z } from 'zod';

export const CreateNewsletterSubscriberSchema = z.object({
  email: z.string().email('Invalid email').max(255).trim(),
  locale: z.string().max(5).optional(),
  // ── Anti-spam metadata (evaluated then discarded, never stored)
  _hp: z.string().max(500).optional(),
  _t: z.number().int().positive().optional(),
  _token: z.string().max(2500).optional(),
});

export type CreateNewsletterSubscriberDto = z.infer<
  typeof CreateNewsletterSubscriberSchema
>;
