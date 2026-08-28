import { PickupPoint, PickupPointLocality, PickupPointSearchQuery } from '../pickup-point.types';

/** DI token — the concrete adapter is chosen in PickupPointsModule, never imported directly. */
export const PICKUP_POINT_PROVIDER = Symbol('PICKUP_POINT_PROVIDER');

/**
 * The only surface the application layer may use to reach a pickup-point
 * network.
 *
 * Carrier-agnostic on purpose: one implementation may front several networks
 * (Sendcloud serves Mondial Relay, Colissimo and others through one account),
 * so the carrier is a parameter rather than a property of the adapter.
 * Implementations translate to and from their own wire format entirely
 * internally — no carrier or aggregator field name may appear in a signature
 * here or in anything it returns.
 *
 * Every method resolves rather than throwing on "no result" — an unknown point
 * is `null`, an unserved area is `[]`. Only genuine faults (transport failure,
 * bad credentials, malformed response) throw, so callers can distinguish
 * "nothing there" from "we could not ask".
 */
export interface PickupPointProvider {
  /** Points near a location, nearest first when the network ranks by distance. */
  searchPickupPoints(query: PickupPointSearchQuery): Promise<PickupPoint[]>;

  /**
   * Every place the network serves in a country, for the locality index behind
   * type-ahead suggestions. One broad call whose result is cached for hours —
   * never on the request path of a keystroke.
   *
   * Returns `[]` (never throws) when the network cannot answer that broadly, so
   * a provider without bulk support simply yields no suggestions rather than
   * breaking the picker.
   */
  listLocalities(country: string, carrierCode?: string | null): Promise<PickupPointLocality[]>;

  /** One point by its network id, or null when it no longer exists for that country/carrier. */
  getPickupPoint(country: string, id: string, carrierCode?: string | null): Promise<PickupPoint | null>;

  /**
   * Re-reads a point and confirms it is still selectable for `country`.
   * Checkout calls this immediately before payment: a point can be retired,
   * or the customer can change country after choosing one, and neither must
   * ever reach order creation.
   */
  validatePickupPoint(country: string, id: string, carrierCode?: string | null): Promise<PickupPoint | null>;
}
