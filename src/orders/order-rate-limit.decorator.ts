import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMIT_BUCKET } from '../common/throttling/rate-limit.decorator';
import { OrderThrottlerGuard } from './order-throttler.guard';

/**
 * The two tiers an order route can sit in. Which one it takes is a security
 * decision, so it is stated at the route rather than left to a number.
 */
export const ORDER_LIMIT = {
  /**
   * Checking a credential — the enumeration surface. Counted per visitor, and
   * deliberately tight: a customer looks their order up once and then holds a
   * cookie, so anything approaching this rate is a script.
   */
  verifying: [20, 15] as const,

  /**
   * Reading or writing an order the caller has already proved is theirs.
   * Counted per order, and generous: this is a human reloading their own
   * tracking page, switching tabs, or coming back tomorrow. The ceiling
   * exists for a client stuck in a loop, not for an attacker — there is
   * nothing here to attack, the grant is the proof.
   */
  proven: [240, 15] as const,

  /**
   * Sending images. Proven too, but each call decodes and re-encodes what it
   * is given, so the ceiling is about this server's CPU rather than about the
   * caller — which is why it is lower than a plain read.
   */
  uploading: [40, 15] as const,
} as const;

/**
 * Rate-limits an order route: `@OrderRateLimit(...ORDER_LIMIT.proven)`.
 *
 * Applies the grant-aware guard as well as the numbers, because a route
 * carrying `@Throttle` without a guard is silently unlimited.
 */
export function OrderRateLimit(limit: number, ttlMinutes: number) {
  return applyDecorators(
    UseGuards(OrderThrottlerGuard),
    Throttle({ [RATE_LIMIT_BUCKET]: { limit, ttl: ttlMinutes * 60_000 } }),
  );
}
