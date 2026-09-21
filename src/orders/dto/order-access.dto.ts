import { z } from 'zod';

/**
 * A visitor asking for a grant. Both fields are optional because the two
 * credentials are alternatives, not a pair: a `token` from an order email, or
 * the address on the order. Presenting neither is simply refused.
 */
export const OrderSessionSchema = z.object({
  token: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(300).optional(),
});
export type OrderSessionDto = z.infer<typeof OrderSessionSchema>;

/**
 * A request to have the order's secure link emailed to the buyer.
 *
 * The address is optional because a visitor who already holds a `status` grant
 * has proved they know it — asking them to retype it would imply the link
 * could be sent somewhere else, which it cannot: the destination is always the
 * address stored on the order.
 */
export const OrderAccessLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(300).optional(),
});
export type OrderAccessLinkDto = z.infer<typeof OrderAccessLinkSchema>;
