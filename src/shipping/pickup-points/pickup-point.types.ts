/**
 * Carrier-neutral pickup-point model. Nothing outside
 * `pickup-points/providers/` may reference a carrier's or aggregator's own wire
 * format — checkout, orders and the admin all work with these shapes, so
 * swapping one provider for another touches no domain code.
 */

/** Physical kind of point. `locker` is an automated parcel machine, `relay` a staffed shop. */
export type PickupPointType = 'relay' | 'locker';

/** One day's opening slots. A closed day is an empty array, never a missing key. */
export interface PickupPointOpeningDay {
  /** ISO-8601 day number: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Zero, one or two "HH:MM-HH:MM" slots — carriers commonly split for lunch. */
  slots: string[];
}

export interface PickupPoint {
  /** Carrier's own identifier for the point, unique within `country`. */
  id: string;
  name: string;
  address: string;
  postcode: string;
  city: string;
  /** ISO 3166-1 alpha-2, upper-case. */
  country: string;
  latitude: number | null;
  longitude: number | null;
  openingHours: PickupPointOpeningDay[];
  type: PickupPointType;
  /** Metres from the searched location; null when the network didn't rank by distance. */
  distanceMeters: number | null;
  /** Network the point belongs to, e.g. "mondial_relay"; null when unreported. */
  carrierCode: string | null;
}

/**
 * A place that has at least one pickup point. Built into a cached index so the
 * storefront can suggest from the first keystroke without a carrier call per
 * character — no pickup network offers an autocomplete endpoint.
 */
export interface PickupPointLocality {
  city: string;
  postcode: string;
  /** How many points the network has there — ranks the suggestions. */
  count: number;
}

export interface PickupPointSearchQuery {
  /** ISO 3166-1 alpha-2. Always taken from the order's shipping address, never the client. */
  country: string;
  postcode?: string;
  city?: string;
  /** Free-text street/address line, when the network supports it. */
  address?: string;
  /**
   * Restricts results to one carrier network. Comes from the selected
   * ShippingMethod.carrierCode — a "Mondial Relay" method must never offer a
   * Colissimo point, even when one account fronts both.
   */
  carrierCode?: string | null;
  /** Upper bound on returned points; the provider may return fewer. */
  limit?: number;
}
