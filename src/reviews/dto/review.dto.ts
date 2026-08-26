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

/** One picture or clip on a review. `key` is a storage key the admin picked
 *  from the media library; the URL is resolved on read like every other asset. */
export const ReviewMediaItemSchema = z.object({
  key: z.string().min(1).max(1000),
  type: z.enum(['image', 'video']),
  altText: z.string().max(300).nullish(),
});

export const AdminUpdateReviewSchema = z.object({
  authorName: z.string().min(1).max(300).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
  /** Reviews are read newest-first and the date is shown, so an imported one
   *  needs its original date rather than the moment it was typed in. */
  createdAt: z.coerce.date().optional(),
  sourceUrl: z.string().max(1000).nullish(),
  media: z.array(ReviewMediaItemSchema).max(8).optional(),
});
export type AdminUpdateReviewDto = z.infer<typeof AdminUpdateReviewSchema>;

/**
 * A review the admin enters by hand, copied from a supplier or marketplace
 * listing for the same product.
 *
 * Deliberately has no `isVerifiedPurchase` and no `source`: the service pins
 * both. "Verified purchase" is a specific factual claim about an order in this
 * shop, and there is no such order behind one of these.
 */
export const AdminCreateReviewSchema = z.object({
  productId: z.string().uuid(),
  authorName: z.string().min(1).max(300),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
  createdAt: z.coerce.date().optional(),
  sourceUrl: z.string().max(1000).nullish(),
  media: z.array(ReviewMediaItemSchema).max(8).optional(),
  /** Defaults to approved: an admin typing a review in has already vetted it,
   *  and routing it to the moderation queue would only ask them to approve
   *  their own entry. */
  status: z.enum(['approved', 'pending', 'hidden']).optional(),
});
export type AdminCreateReviewDto = z.infer<typeof AdminCreateReviewSchema>;
