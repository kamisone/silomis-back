import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Proof that a visitor owns an order, and what that proof entitles them to.
 *
 * Two credentials reach this file and they are not worth the same thing:
 *
 *  - `trackingToken` — a random UUID, sent only to the address on the order.
 *    Holding it is evidence the holder can read that mailbox.
 *  - `orderNumber` + `customerEmail` — order numbers are sequential
 *    (`ORD-000123`, see OrdersService.create) and an email address is not a
 *    secret, so this pair is a guess away from being anyone's.
 *
 * The status page has always accepted the weak pair and still does: showing a
 * delivery state to someone who can name the order and the buyer is the
 * ordinary trade-off every shop makes. Anything that lets a visitor *write* —
 * the order conversation — requires the strong one, so an impostor cannot talk
 * to the shop as the customer.
 */
export type OrderAccessLevel = 'status' | 'full';

export interface OrderAccessGrant {
  orderId: string;
  orderNumber: string;
  level: OrderAccessLevel;
}

/** How long a grant cookie stays valid before the visitor has to prove it again. */
export const ORDER_GRANT_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How many "email me a link" requests one order accepts per hour.
 *
 * Per order, not per IP: the address is fixed by the order record, so the
 * abuse this stops is mailbombing one customer, which a new IP does nothing
 * to prevent.
 */
export const ACCESS_LINK_MAX_PER_HOUR = 3;

/**
 * Grants are signed with a key DERIVED from JWT_SECRET, never with JWT_SECRET
 * itself.
 *
 * `src/auth/jwt.strategy.ts` accepts any token that verifies against
 * JWT_SECRET and takes its `sub` claim as the admin's id — no audience, no
 * purpose, no role, no database lookup. A customer-facing token signed with
 * that same key is therefore one `sub` claim away from being an admin
 * session. Deriving a separate key puts this token family cryptographically
 * out of that strategy's reach, whatever claims it carries.
 */
export function orderGrantSecret(): string {
  const base = process.env.JWT_SECRET;
  if (!base) {
    throw new Error(
      'JWT_SECRET env var is required to sign order access grants',
    );
  }
  return createHmac('sha256', base)
    .update('silomis:order-access:v1')
    .digest('hex');
}

/** Constant-time string compare, so a tracking token cannot be probed byte by byte. */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — compare against a same-length buffer and let the flag decide.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
