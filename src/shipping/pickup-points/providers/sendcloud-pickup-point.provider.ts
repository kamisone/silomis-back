import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { IntegrationCredentialsService } from '../../../integration-credentials/integration-credentials.service';
import { PickupPointProvider } from './pickup-point.provider';
import { PickupPoint, PickupPointLocality, PickupPointOpeningDay, PickupPointSearchQuery, PickupPointType } from '../pickup-point.types';

/** Provider key under which the Sendcloud key pair is stored, encrypted at rest. */
export const SENDCLOUD_CREDENTIALS_PROVIDER = 'sendcloud';

interface SendcloudCredentials {
  publicKey: string;
  secretKey: string;
}

/**
 * Verified by probing: the host is plural (`servicepoints`), and the collection
 * path needs its trailing slash — without it Sendcloud answers 301 to the
 * slashed form. Requesting the canonical URL avoids a redirect on every call.
 */
const SERVICE_POINT_BASE = 'https://servicepoints.sendcloud.sc/api/v2';
const OAUTH_TOKEN_URL = 'https://account.sendcloud.com/oauth2/token';
const REQUEST_TIMEOUT_MS = 8000;
/** Refresh this long before the stated expiry, so a call never races the cutover. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/**
 * Sendcloud Service Points adapter.
 *
 * Sendcloud fronts several pickup networks (Mondial Relay, Colissimo, …) behind
 * one account, so the carrier is a query filter rather than a property of this
 * class — a "Mondial Relay" shipping method must never surface a Colissimo
 * point. Everything Sendcloud-specific (auth, query params, response shape)
 * stays inside this file; callers see only the normalized PickupPoint.
 *
 * Auth is OAuth2 client_credentials, cached for its lifetime: tokens last an
 * hour and Sendcloud explicitly asks integrations not to mint one per call.
 * Basic auth is the documented fallback and is used automatically when the
 * token endpoint refuses — an integration flagged "Use OAuth2 authentication"
 * rejects Basic, and one that is not may not have OAuth2 provisioned.
 *
 * NOT VERIFIED END-TO-END: written from Sendcloud's published authentication
 * docs, but no request has been made against the live service. The query
 * parameter names and the response mapping below are the parts to re-check
 * first — see the spec file, which pins the assumed shape in one place.
 */
@Injectable()
export class SendcloudPickupPointProvider implements PickupPointProvider {
  private readonly logger = new Logger(SendcloudPickupPointProvider.name);

  /** Cached bearer token, shared across requests. Null until the first successful mint. */
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly credentials: IntegrationCredentialsService) {}

  async searchPickupPoints(query: PickupPointSearchQuery): Promise<PickupPoint[]> {
    const country = query.country.toUpperCase();
    // Sendcloud needs a locality to anchor the search; asking with neither is
    // a wasted round trip that returns the whole country or an error.
    if (!query.postcode?.trim() && !query.city?.trim()) return [];

    const params = new URLSearchParams({ country });
    if (query.postcode?.trim()) params.set('postal_code', query.postcode.trim());
    if (query.city?.trim()) params.set('city', query.city.trim());
    if (query.address?.trim()) params.set('address', query.address.trim());
    if (query.carrierCode) params.set('carrier', query.carrierCode);
    params.set('radius', '20000');

    const payload = await this.get<unknown[]>(`/service-points/?${params.toString()}`);
    const points = (Array.isArray(payload) ? payload : []).map((raw) => this.toPickupPoint(raw)).filter((p): p is PickupPoint => p !== null);

    return points.slice(0, query.limit ?? 10);
  }

  /**
   * One country-wide sweep, reduced to distinct city/postcode pairs inside the
   * adapter so the large payload never leaves it. Sendcloud has no autocomplete
   * endpoint, so this is the only way to offer prefix suggestions; the caller
   * caches the result for hours.
   *
   * Failures are swallowed deliberately — suggestions are an enhancement, and a
   * network that refuses a broad query must not break the picker.
   */
  async listLocalities(country: string, carrierCode?: string | null): Promise<PickupPointLocality[]> {
    const params = new URLSearchParams({ country: country.toUpperCase() });
    if (carrierCode) params.set('carrier', carrierCode);

    let payload: unknown[] | null;
    try {
      payload = await this.get<unknown[]>(`/service-points/?${params.toString()}`);
    } catch {
      this.logger.warn(`Sendcloud refused a country-wide lookup for ${country} — no locality suggestions available`);
      return [];
    }
    if (!Array.isArray(payload)) return [];

    const byKey = new Map<string, PickupPointLocality>();
    for (const raw of payload) {
      const point = this.toPickupPoint(raw);
      if (!point?.city || !point.postcode) continue;

      const key = `${point.postcode}|${point.city}`.toLowerCase();
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { city: point.city, postcode: point.postcode, count: 1 });
    }
    return [...byKey.values()];
  }

  async getPickupPoint(country: string, id: string, carrierCode?: string | null): Promise<PickupPoint | null> {
    const params = new URLSearchParams({ country: country.toUpperCase() });
    const raw = await this.get<unknown>(`/service-points/${encodeURIComponent(id)}/?${params.toString()}`, true);
    if (raw === null) return null;

    const point = this.toPickupPoint(raw);
    if (!point) return null;

    // A network mismatch is as disqualifying as a country mismatch: the
    // selected shipping method is for one carrier only.
    if (carrierCode && point.carrierCode && point.carrierCode !== carrierCode) return null;
    return point;
  }

  validatePickupPoint(country: string, id: string, carrierCode?: string | null): Promise<PickupPoint | null> {
    return this.getPickupPoint(country, id, carrierCode);
  }

  // ── Sendcloud wire format — nothing below this line escapes the adapter ──

  private async loadCredentials(): Promise<SendcloudCredentials> {
    const raw = await this.credentials.get(SENDCLOUD_CREDENTIALS_PROVIDER);
    if (!raw) throw new ServiceUnavailableException('Sendcloud is not configured');

    let parsed: Partial<SendcloudCredentials>;
    try {
      parsed = JSON.parse(raw) as Partial<SendcloudCredentials>;
    } catch {
      throw new ServiceUnavailableException('Sendcloud credentials are malformed');
    }
    if (!parsed.publicKey || !parsed.secretKey) {
      throw new ServiceUnavailableException('Sendcloud credentials are incomplete');
    }
    return { publicKey: parsed.publicKey, secretKey: parsed.secretKey };
  }

  private basicHeader(creds: SendcloudCredentials): string {
    return `Basic ${Buffer.from(`${creds.publicKey}:${creds.secretKey}`).toString('base64')}`;
  }

  /**
   * A cached client_credentials token. Returns null when the token endpoint
   * refuses, so the caller can fall back to Basic auth rather than fail — some
   * integrations are provisioned for one mechanism only.
   */
  private async accessToken(creds: SendcloudCredentials): Promise<string | null> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return this.token.value;

    try {
      const res = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: this.basicHeader(creds),
        },
        body: 'grant_type=client_credentials&scope=api',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Sendcloud token request returned HTTP ${res.status} — falling back to basic auth`);
        return null;
      }

      const body = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!body.access_token) return null;

      this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
      return this.token.value;
    } catch (err) {
      this.logger.warn(`Sendcloud token request failed: ${(err as Error).message} — falling back to basic auth`);
      return null;
    }
  }

  /**
   * @param nullOn404 treat a 404 as "no such point" rather than a fault —
   * correct for a lookup by id, wrong for a search.
   */
  private async get<T>(path: string, nullOn404 = false): Promise<T | null> {
    const creds = await this.loadCredentials();
    const token = await this.accessToken(creds);
    const authorization = token ? `Bearer ${token}` : this.basicHeader(creds);

    let res: Response;
    try {
      res = await fetch(`${SERVICE_POINT_BASE}${path}`, {
        headers: { Accept: 'application/json', Authorization: authorization },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`Sendcloud service-point lookup failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Pickup points are unavailable');
    }

    if (nullOn404 && res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      // A cached token may have been revoked server-side; drop it so the next
      // call re-mints rather than repeating a request that cannot succeed.
      this.token = null;
      this.logger.warn(`Sendcloud rejected the credentials (HTTP ${res.status}): ${await errorMessage(res)}`);
      throw new ServiceUnavailableException('Pickup points are unavailable');
    }
    if (!res.ok) {
      this.logger.warn(`Sendcloud returned HTTP ${res.status}: ${await errorMessage(res)}`);
      throw new ServiceUnavailableException('Pickup points are unavailable');
    }

    try {
      return (await res.json()) as T;
    } catch {
      this.logger.warn('Sendcloud returned a malformed JSON body');
      throw new ServiceUnavailableException('Pickup points are unavailable');
    }
  }

  /** Maps one Sendcloud service point onto the normalized model; null when unusable. */
  private toPickupPoint(raw: unknown): PickupPoint | null {
    const sp = raw as Record<string, unknown> | null;
    const id = sp?.id;
    if (sp === null || (typeof id !== 'string' && typeof id !== 'number')) return null;

    const str = (key: string): string => (typeof sp[key] === 'string' ? (sp[key] as string) : '');
    // A coordinate of exactly 0 is a real place — the prime meridian crosses
    // France and eastern Spain — so only a genuinely unparseable value is null.
    // The comma swap guards against a locale-formatted decimal, where
    // parseFloat('48,85') would otherwise silently yield 48.
    const coord = (key: string, limit: number): number | null => {
      const raw = sp[key];
      if (raw === null || raw === undefined || raw === '') return null;
      const value = Number.parseFloat(String(raw).trim().replace(',', '.'));
      return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
    };

    return {
      id: String(id),
      name: str('name'),
      address: [str('street'), str('house_number')].filter(Boolean).join(' ').trim(),
      postcode: str('postal_code'),
      city: str('city'),
      country: str('country').toUpperCase(),
      latitude: coord('latitude', 90),
      longitude: coord('longitude', 180),
      openingHours: parseOpeningHours(sp['formatted_opening_times']),
      type: parsePointType(str('shop_type')),
      distanceMeters: typeof sp['distance'] === 'number' ? Math.round(sp['distance']) : null,
      carrierCode: str('carrier') || null,
    };
  }
}

/**
 * Sendcloud wraps failures as `{ error: { code, request, message } }`. Pulling
 * the message into the log is what turns "HTTP 400" into an actionable line —
 * it names the offending parameter.
 */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message ?? '(no message)';
  } catch {
    return '(unreadable body)';
  }
}

/**
 * Sendcloud reports opening times keyed by weekday index, each an array of
 * "HH:MM - HH:MM" strings. Always emits all seven days so the UI never has to
 * guard for a missing one; a closed day is an empty slot list.
 */
function parseOpeningHours(raw: unknown): PickupPointOpeningDay[] {
  const byIndex = (raw ?? {}) as Record<string, unknown>;
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    // Sendcloud indexes 0 = Monday; the normalized model uses ISO 1 = Monday.
    const entries = byIndex[String(weekday - 1)];
    const slots = Array.isArray(entries)
      ? entries
          .map((slot) => (typeof slot === 'string' ? slot.replace(/\s*-\s*/, '-').trim() : ''))
          .filter((slot) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(slot))
      : [];
    return { weekday, slots };
  });
}

/** Sendcloud's shop_type distinguishes staffed shops from automated lockers. */
function parsePointType(shopType: string): PickupPointType {
  return /locker|parcel\s*machine|automat/i.test(shopType) ? 'locker' : 'relay';
}
