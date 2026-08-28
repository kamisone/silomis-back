import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PICKUP_POINT_PROVIDER, PickupPointProvider } from './providers/pickup-point.provider';
import { PickupPointLocality } from './pickup-point.types';

/** Long enough that a keystroke never waits on the carrier; short enough that new points appear within a day. */
const INDEX_TTL_SECONDS = 12 * 60 * 60;
/** Guards against an unbounded country sweep filling Redis. */
const MAX_INDEXED_LOCALITIES = 20_000;
const MAX_SUGGESTIONS = 8;

/**
 * Type-ahead locality suggestions.
 *
 * No pickup network offers an autocomplete endpoint, so suggestions come from a
 * locality index: one broad per-country sweep, reduced to distinct city/postcode
 * pairs and cached in Redis. A keystroke then matches against memory rather than
 * calling the carrier — which is what makes suggestions appear from the first
 * character instead of only once a city name is complete.
 *
 * Every failure mode degrades to "no suggestions": an unreachable Redis, a
 * provider that refuses a broad query, a cold cache that cannot be filled. The
 * picker's own search still works in all of those cases.
 */
@Injectable()
export class PickupPointLocalitiesService {
  private readonly logger = new Logger(PickupPointLocalitiesService.name);

  /**
   * De-duplicates concurrent builds: the first customer to type in a cold
   * country would otherwise trigger one country-wide sweep per keystroke.
   */
  private readonly inFlight = new Map<string, Promise<PickupPointLocality[]>>();

  constructor(
    private readonly redis: RedisService,
    @Inject(PICKUP_POINT_PROVIDER) private readonly provider: PickupPointProvider,
  ) {}

  /**
   * Localities whose city or postcode starts with `prefix`, best match first.
   * A postcode prefix ranks a place above a city-name prefix, since a customer
   * typing digits almost always means the postcode.
   */
  async suggest(country: string, carrierCode: string | null, prefix: string): Promise<PickupPointLocality[]> {
    const needle = prefix.trim().toLowerCase();
    if (!needle) return [];

    const index = await this.index(country, carrierCode);
    if (!index.length) return [];

    const scored: Array<{ locality: PickupPointLocality; rank: number }> = [];
    for (const locality of index) {
      const city = locality.city.toLowerCase();
      const postcode = locality.postcode.toLowerCase();

      // 0 = postcode prefix, 1 = city prefix, 2 = city contains (catches
      // "Saint-Denis" when the customer types "denis").
      const rank = postcode.startsWith(needle) ? 0 : city.startsWith(needle) ? 1 : city.includes(needle) ? 2 : -1;
      if (rank >= 0) scored.push({ locality, rank });
    }

    return scored
      .sort((a, b) => a.rank - b.rank || b.locality.count - a.locality.count || a.locality.city.localeCompare(b.locality.city))
      .slice(0, MAX_SUGGESTIONS)
      .map((s) => s.locality);
  }

  private cacheKey(country: string, carrierCode: string | null): string {
    return `pickup:localities:${country.toUpperCase()}:${carrierCode ?? 'any'}`;
  }

  /** Cached index for a country/carrier, building it on a miss. */
  private async index(country: string, carrierCode: string | null): Promise<PickupPointLocality[]> {
    const key = this.cacheKey(country, carrierCode);

    const cached = await this.readCache(key);
    if (cached) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const build = this.build(key, country, carrierCode).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, build);
    return build;
  }

  private async readCache(key: string): Promise<PickupPointLocality[] | null> {
    try {
      const raw = await this.redis.client.get(key);
      return raw ? (JSON.parse(raw) as PickupPointLocality[]) : null;
    } catch {
      // An unreachable or slow Redis must not stall checkout — treat as a miss.
      return null;
    }
  }

  private async build(key: string, country: string, carrierCode: string | null): Promise<PickupPointLocality[]> {
    const localities = (await this.provider.listLocalities(country, carrierCode)).slice(0, MAX_INDEXED_LOCALITIES);

    if (!localities.length) {
      // Cache the empty answer briefly too, so a provider that cannot answer
      // broadly is not re-asked on every keystroke.
      await this.writeCache(key, [], 300);
      return [];
    }

    this.logger.log(`Indexed ${localities.length} localities for ${country}/${carrierCode ?? 'any'}`);
    await this.writeCache(key, localities, INDEX_TTL_SECONDS);
    return localities;
  }

  private async writeCache(key: string, value: PickupPointLocality[], ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Losing the cache only costs a rebuild; never fail the request for it.
    }
  }
}
