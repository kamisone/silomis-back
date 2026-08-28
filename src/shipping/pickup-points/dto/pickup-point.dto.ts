import { z } from 'zod';

/**
 * Search terms only — the destination country is deliberately absent. It is
 * read server-side from the order's shipping address (see PickupPointsService),
 * so a tampered request cannot search outside the country being shipped to.
 */
export const SearchPickupPointsSchema = z.object({
  orderId: z.string().uuid(),
  postcode: z.string().max(20).optional(),
  city: z.string().max(200).optional(),
  address: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
export type SearchPickupPointsDto = z.infer<typeof SearchPickupPointsSchema>;

/** Type-ahead terms. Country and carrier are resolved from the order, so neither appears here. */
export const SuggestLocalitiesSchema = z.object({
  orderId: z.string().uuid(),
  q: z.string().min(1).max(120),
});
export type SuggestLocalitiesDto = z.infer<typeof SuggestLocalitiesSchema>;

export const SelectPickupPointSchema = z.object({
  /** Carrier's own point id. Never trusted for anything but the re-read. */
  pickupPointId: z.string().min(1).max(100),
});
export type SelectPickupPointDto = z.infer<typeof SelectPickupPointSchema>;
