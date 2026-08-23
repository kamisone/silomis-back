import { z } from 'zod';

export const VerifyOrderSchema = z.object({
  orderNumber: z.string().min(1).max(50),
  productId: z.string().uuid(),
  email: z.string().email().max(300).nullish(),
  token: z.string().uuid().nullish(),
});
export type VerifyOrderDto = z.infer<typeof VerifyOrderSchema>;

// multipart/form-data — every field arrives as a string; rating uses z.coerce
export const SubmitReviewSchema = z.object({
  orderNumber: z.string().min(1).max(50),
  productId: z.string().uuid(),
  email: z.string().email().max(300).nullish(),
  token: z.string().uuid().nullish(),
  authorName: z.string().min(1).max(300),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
  /** JSON-stringified array of media keys to retain — edit flow only. */
  keepMediaKeys: z.string().max(4000).nullish(),
  // Anti-spam metadata — evaluated then discarded, never persisted.
  _hp: z.string().max(500).optional(),
  _t: z.coerce.number().int().positive().optional(),
  _token: z.string().max(2500).optional(),
});
export type SubmitReviewDto = z.infer<typeof SubmitReviewSchema>;

export const ModerateReviewSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'hidden']),
  rejectionReason: z.string().max(500).nullish(),
});
export type ModerateReviewDto = z.infer<typeof ModerateReviewSchema>;

export const AdminUpdateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
});
export type AdminUpdateReviewDto = z.infer<typeof AdminUpdateReviewSchema>;
