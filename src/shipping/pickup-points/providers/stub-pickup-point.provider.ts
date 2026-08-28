import { Injectable, Logger } from '@nestjs/common';
import { PickupPointProvider } from './pickup-point.provider';
import { PickupPoint, PickupPointLocality, PickupPointSearchQuery } from '../pickup-point.types';

/**
 * Deterministic fixture provider for local development and tests.
 *
 * These are invented points, not captured production responses — they exist so
 * the checkout flow, eligibility rules and validation can be exercised without
 * carrier credentials. Selected explicitly (PICKUP_POINT_PROVIDER=stub) or as
 * the fallback when no credentials are configured outside production; it never
 * stands in silently for a failing real adapter.
 *
 * Every field is written to be unmistakable on screen — the name is prefixed,
 * the street says so outright, and coordinates are null rather than a plausible
 * city centre. A developer looking at checkout must never have to wonder
 * whether they are seeing the carrier's data or ours.
 */
@Injectable()
export class StubPickupPointProvider implements PickupPointProvider {
  private readonly logger = new Logger(StubPickupPointProvider.name);

  /** Prefixed onto every fixture name so invented points are obvious wherever they are rendered. */
  private static readonly FIXTURE_PREFIX = '[TEST DATA]';

  /** Countries the fixtures cover — a deliberately small set, so "unserved country" is testable. */
  private static readonly COUNTRIES = ['FR', 'BE', 'ES'];

  private static readonly WEEKDAY_HOURS = [
    { weekday: 1, slots: ['09:00-12:30', '14:00-19:00'] },
    { weekday: 2, slots: ['09:00-12:30', '14:00-19:00'] },
    { weekday: 3, slots: ['09:00-12:30', '14:00-19:00'] },
    { weekday: 4, slots: ['09:00-12:30', '14:00-19:00'] },
    { weekday: 5, slots: ['09:00-12:30', '14:00-18:00'] },
    { weekday: 6, slots: ['09:00-13:00'] },
    { weekday: 7, slots: [] },
  ];

  searchPickupPoints(query: PickupPointSearchQuery): Promise<PickupPoint[]> {
    const country = query.country.toUpperCase();
    if (!StubPickupPointProvider.COUNTRIES.includes(country)) return Promise.resolve([]);

    const postcode = query.postcode?.trim() || '75001';
    const city = query.city?.trim() || 'Paris';
    const limit = Math.min(query.limit ?? 10, 10);

    const points = Array.from({ length: limit }, (_, i) => this.buildPoint(country, postcode, city, i, query.carrierCode ?? null));
    this.logger.warn(`Returning ${points.length} FIXTURE pickup point(s) for ${country} ${postcode} — not real carrier data`);
    return Promise.resolve(points);
  }

  /** A handful of obviously-fake localities, enough to exercise the suggestion UI. */
  listLocalities(country: string): Promise<PickupPointLocality[]> {
    if (!StubPickupPointProvider.COUNTRIES.includes(country.toUpperCase())) return Promise.resolve([]);
    return Promise.resolve([
      { city: '[TEST DATA] Fixtureville', postcode: '75001', count: 6 },
      { city: '[TEST DATA] Sampleton', postcode: '75010', count: 3 },
      { city: '[TEST DATA] Mockborough', postcode: '69001', count: 2 },
    ]);
  }

  getPickupPoint(country: string, id: string, carrierCode?: string | null): Promise<PickupPoint | null> {
    const upper = country.toUpperCase();
    if (!StubPickupPointProvider.COUNTRIES.includes(upper)) return Promise.resolve(null);

    // Fixture ids are "<COUNTRY>-<postcode>-<index>"; anything else is unknown.
    const match = /^([A-Z]{2})-(\d{4,10})-(\d+)$/.exec(id);
    if (!match || match[1] !== upper) return Promise.resolve(null);

    const index = Number(match[3]);
    if (index < 0 || index > 9) return Promise.resolve(null);
    return Promise.resolve(this.buildPoint(upper, match[2], 'Paris', index, carrierCode ?? null));
  }

  validatePickupPoint(country: string, id: string, carrierCode?: string | null): Promise<PickupPoint | null> {
    return this.getPickupPoint(country, id, carrierCode);
  }

  private buildPoint(country: string, postcode: string, city: string, index: number, carrierCode: string | null): PickupPoint {
    const type = index % 3 === 0 ? 'locker' : 'relay';
    return {
      id: `${country}-${postcode}-${index}`,
      name: `${StubPickupPointProvider.FIXTURE_PREFIX} Sample ${type === 'locker' ? 'locker' : 'relay point'} ${index + 1}`,
      address: 'Fixture address — not a real location',
      postcode,
      city,
      country,
      // Null, not a plausible city centre: the stub has no idea where these
      // are, and a confidently wrong coordinate is worse than an absent one.
      latitude: null,
      longitude: null,
      openingHours: StubPickupPointProvider.WEEKDAY_HOURS.map((d) => ({ ...d, slots: [...d.slots] })),
      type,
      distanceMeters: null,
      // Echoed back so a carrier-filtered search never looks like a mismatch.
      carrierCode,
    };
  }
}
