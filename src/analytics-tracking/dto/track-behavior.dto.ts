import { z } from 'zod';

/** Only client-triggerable event types — add_to_cart/checkout_started/etc. are written server-side only, never accepted from this public endpoint. */
export const TrackBehaviorSchema = z.object({
  eventType: z.enum(['product_view', 'search']),
  productId: z.string().uuid().nullish(),
  searchQuery: z.string().max(300).nullish(),
  resultCount: z.number().int().min(0).nullish(),
  cartToken: z.string().max(100).nullish(),
  /** Visitor's first-touch landing referrer / utm_source (front/src/lib/shop/trafficSource.ts), classified server-side. */
  referrer: z.string().max(2000).nullish(),
  utmSource: z.string().max(100).nullish(),
});
export type TrackBehaviorDto = z.infer<typeof TrackBehaviorSchema>;
