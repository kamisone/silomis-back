import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from '../guards/client-ip-throttler.guard';

/**
 * The one and only throttler bucket.
 *
 * `@nestjs/throttler` checks EVERY bucket registered in
 * `ThrottlerModule.forRoot` against EVERY route under a ThrottlerGuard —
 * `@Throttle({ myBucket: … })` overrides that bucket's numbers for the route,
 * it does not narrow the route to that bucket. So with three named buckets,
 * the strictest of the three governed all three groups of routes: the order
 * tracking page silently inherited the contact form's 5-per-15-minutes and
 * locked a customer out for reloading it three times.
 *
 * The names were never buying anything anyway. The guard's own key is
 * `sha256(ClassName-handlerName-throttlerName-tracker)` (see
 * ThrottlerGuard.generateKey), so counters are already per route: two routes
 * sharing a bucket name never share a counter. All a second name added was
 * the chance to tighten an unrelated route by accident.
 *
 * Hence one bucket, and per-route numbers through `@RateLimit` below. Adding a
 * limit somewhere new cannot change the limit anywhere else.
 */
export const RATE_LIMIT_BUCKET = 'default';

/**
 * Rate-limits one route: `@RateLimit(10, 15)` is ten requests per fifteen
 * minutes, counted per visitor.
 *
 * Per *visitor*, not per socket — the guard reads the address the Next proxy
 * forwards. Every storefront and admin call arrives through that proxy, so the
 * stock tracker would put the whole internet in one bucket and let any
 * stranger's failed logins lock out every admin at once.
 *
 * Applies the guard as well as the numbers on purpose: the two were separate
 * decorators before, and a route carrying `@Throttle` without `@UseGuards` is
 * silently unlimited.
 */
export function RateLimit(limit: number, ttlMinutes: number) {
  return applyDecorators(
    UseGuards(ClientIpThrottlerGuard),
    Throttle({ [RATE_LIMIT_BUCKET]: { limit, ttl: ttlMinutes * 60_000 } }),
  );
}
