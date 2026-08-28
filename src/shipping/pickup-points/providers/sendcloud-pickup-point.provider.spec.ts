import { ServiceUnavailableException } from '@nestjs/common';
import { SendcloudPickupPointProvider } from './sendcloud-pickup-point.provider';
import { IntegrationCredentialsService } from '../../../integration-credentials/integration-credentials.service';

const CREDS = { publicKey: 'pub-key', secretKey: 'secret-key' };
const EXPECTED_BASIC = `Basic ${Buffer.from('pub-key:secret-key').toString('base64')}`;

function credentialsService(value: string | null = JSON.stringify(CREDS)): IntegrationCredentialsService {
  return { get: jest.fn().mockResolvedValue(value) } as unknown as IntegrationCredentialsService;
}

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: () => Promise.resolve(body) });
const TOKEN_OK = json({ access_token: 'ory_at_abc', expires_in: 3599, token_type: 'bearer' });

/** Routes the token endpoint and the API to separate responses. */
function routedFetch(apiResponses: unknown[], tokenResponse: unknown = TOKEN_OK) {
  const api = [...apiResponses];
  // Both parameters typed so `mock.calls` stays a [url, init] tuple.
  const spy = jest.fn((url: string, _init?: RequestInit) =>
    Promise.resolve(String(url).includes('/oauth2/token') ? tokenResponse : (api.shift() ?? json([]))),
  );
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

/**
 * ⚠️ NOT a captured production response — no request has been made against the
 * live Sendcloud service. This encodes the shape this adapter currently
 * ASSUMES. On the first real call, diff Sendcloud's actual payload against it
 * and fix fixture and mapper together; this is the one place it is pinned.
 */
const ASSUMED_POINT = {
  id: 1234567,
  name: 'Tabac de la Gare',
  street: 'Rue de la Gare',
  house_number: '12',
  postal_code: '75001',
  city: 'Paris',
  country: 'FR',
  latitude: '48.8566',
  longitude: '2.3522',
  distance: 412,
  carrier: 'mondial_relay',
  shop_type: 'Tabac',
  formatted_opening_times: {
    '0': ['09:00 - 12:30', '14:00 - 19:00'],
    '1': ['09:00 - 19:00'],
    '2': [],
    '3': ['09:00 - 19:00'],
    '4': ['09:00 - 18:00'],
    '5': ['09:00 - 13:00'],
    '6': [],
  },
};

const ASSUMED_LOCKER = { ...ASSUMED_POINT, id: 7654321, name: 'Locker Nord', shop_type: 'Parcel Locker', carrier: 'mondial_relay', distance: 980 };

describe('SendcloudPickupPointProvider — authentication', () => {
  it('mints an OAuth2 client_credentials token with basic-auth keys', async () => {
    const spy = routedFetch([json([])]);
    await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    const [tokenUrl, tokenInit] = spy.mock.calls[0];
    expect(tokenUrl).toBe('https://account.sendcloud.com/oauth2/token');
    expect((tokenInit as { headers: Record<string, string> }).headers.Authorization).toBe(EXPECTED_BASIC);
    expect((tokenInit as { body: string }).body).toBe('grant_type=client_credentials&scope=api');
  });

  it('sends the bearer token on the API call', async () => {
    const spy = routedFetch([json([])]);
    await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    const apiInit = spy.mock.calls[1][1] as { headers: Record<string, string> };
    expect(apiInit.headers.Authorization).toBe('Bearer ory_at_abc');
  });

  it('reuses a cached token instead of minting one per call', async () => {
    const spy = routedFetch([json([]), json([])]);
    const provider = new SendcloudPickupPointProvider(credentialsService());

    await provider.searchPickupPoints({ country: 'FR', postcode: '75001' });
    await provider.searchPickupPoints({ country: 'FR', postcode: '75002' });

    expect(spy.mock.calls.filter(([url]) => String(url).includes('/oauth2/token'))).toHaveLength(1);
  });

  it('falls back to basic auth when the token endpoint refuses', async () => {
    const spy = routedFetch([json([])], json({}, false, 401));
    await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    const apiInit = spy.mock.calls[1][1] as { headers: Record<string, string> };
    expect(apiInit.headers.Authorization).toBe(EXPECTED_BASIC);
  });

  it('drops a cached token when the API rejects it, so the next call re-mints', async () => {
    const spy = routedFetch([json({}, false, 401), json([])]);
    const provider = new SendcloudPickupPointProvider(credentialsService());

    await expect(provider.searchPickupPoints({ country: 'FR', postcode: '75001' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await provider.searchPickupPoints({ country: 'FR', postcode: '75001' });

    expect(spy.mock.calls.filter(([url]) => String(url).includes('/oauth2/token'))).toHaveLength(2);
  });

  it('reports "not configured" when no credentials are stored', async () => {
    routedFetch([json([])]);
    await expect(new SendcloudPickupPointProvider(credentialsService(null)).searchPickupPoints({ country: 'FR', postcode: '75001' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects an incomplete key pair rather than calling with a blank secret', async () => {
    const spy = routedFetch([json([])]);
    await expect(
      new SendcloudPickupPointProvider(credentialsService(JSON.stringify({ publicKey: 'p' }))).searchPickupPoints({ country: 'FR', postcode: '75001' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('SendcloudPickupPointProvider — request shape', () => {
  const apiUrl = (spy: ReturnType<typeof routedFetch>) => new URL(String(spy.mock.calls[1][0]));

  it('passes country and postcode', async () => {
    const spy = routedFetch([json([])]);
    await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'fr', postcode: '75001' });

    const url = apiUrl(spy);
    // Plural host and trailing slash are both load-bearing: the singular host
    // has no DNS record, and the unslashed path 301s.
    expect(url.origin + url.pathname).toBe('https://servicepoints.sendcloud.sc/api/v2/service-points/');
    expect(url.searchParams.get('country')).toBe('FR');
    expect(url.searchParams.get('postal_code')).toBe('75001');
  });

  it('restricts the search to the selected carrier', async () => {
    const spy = routedFetch([json([])]);
    await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001', carrierCode: 'mondial_relay' });

    expect(apiUrl(spy).searchParams.get('carrier')).toBe('mondial_relay');
  });

  it('omits the carrier filter when the method names none', async () => {
    const spy = routedFetch([json([])]);
    await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    expect(apiUrl(spy).searchParams.has('carrier')).toBe(false);
  });

  it('never calls Sendcloud without a locality to search on', async () => {
    const spy = routedFetch([json([])]);
    await expect(new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR' })).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('SendcloudPickupPointProvider — failure handling', () => {
  it('surfaces a transport failure as unavailable, not as an empty result', async () => {
    global.fetch = jest.fn((url: string, _init?: RequestInit) =>
      String(url).includes('/oauth2/token') ? Promise.resolve(TOKEN_OK) : Promise.reject(new Error('ECONNRESET')),
    ) as unknown as typeof fetch;

    await expect(new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats an HTTP error as unavailable', async () => {
    routedFetch([json({}, false, 500)]);
    await expect(new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats a malformed body as unavailable', async () => {
    global.fetch = jest.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(String(url).includes('/oauth2/token') ? TOKEN_OK : { ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) }),
    ) as unknown as typeof fetch;

    await expect(new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns null for a point that no longer exists', async () => {
    routedFetch([json({}, false, 404)]);
    await expect(new SendcloudPickupPointProvider(credentialsService()).getPickupPoint('FR', '1234567')).resolves.toBeNull();
  });

  it('looks a single point up on its own slashed path', async () => {
    const spy = routedFetch([json({ id: 1, country: 'FR' })]);
    await new SendcloudPickupPointProvider(credentialsService()).getPickupPoint('FR', '1234567');

    const url = new URL(String(spy.mock.calls[1][0]));
    expect(url.pathname).toBe('/api/v2/service-points/1234567/');
  });
});

describe('SendcloudPickupPointProvider — response mapping (ASSUMED shape, never verified live)', () => {
  const search = (carrierCode?: string) => {
    routedFetch([json([ASSUMED_POINT, ASSUMED_LOCKER])]);
    return new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001', carrierCode });
  };

  it('normalizes a service point, joining street and house number', async () => {
    const [point] = await search();

    expect(point).toMatchObject({
      id: '1234567',
      name: 'Tabac de la Gare',
      address: 'Rue de la Gare 12',
      postcode: '75001',
      city: 'Paris',
      country: 'FR',
      type: 'relay',
      carrierCode: 'mondial_relay',
      distanceMeters: 412,
    });
  });

  it('parses coordinates delivered as strings', async () => {
    const [point] = await search();
    expect(point.latitude).toBeCloseTo(48.8566);
    expect(point.longitude).toBeCloseTo(2.3522);
  });

  it('keeps a coordinate of exactly zero — the prime meridian is a real place', async () => {
    routedFetch([json([{ ...ASSUMED_POINT, longitude: '0', latitude: '49.5' }])]);
    const [point] = await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '76600' });

    expect(point.longitude).toBe(0);
    expect(point.latitude).toBeCloseTo(49.5);
  });

  it('parses a locale-formatted decimal rather than truncating at the comma', async () => {
    routedFetch([json([{ ...ASSUMED_POINT, latitude: '48,8566', longitude: '2,3522' }])]);
    const [point] = await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    expect(point.latitude).toBeCloseTo(48.8566);
    expect(point.longitude).toBeCloseTo(2.3522);
  });

  it('rejects an out-of-range or unparseable coordinate', async () => {
    routedFetch([json([{ ...ASSUMED_POINT, latitude: '999', longitude: 'n/a' }])]);
    const [point] = await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    expect(point.latitude).toBeNull();
    expect(point.longitude).toBeNull();
  });

  it('recognises a locker from its shop type', async () => {
    const [, locker] = await search();
    expect(locker.type).toBe('locker');
  });

  it('remaps Sendcloud weekday indexes (0 = Monday) to ISO 1-7', async () => {
    const [point] = await search();
    const byDay = Object.fromEntries(point.openingHours.map((d) => [d.weekday, d.slots]));

    expect(point.openingHours.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(byDay[1]).toEqual(['09:00-12:30', '14:00-19:00']);
    expect(byDay[3]).toEqual([]);
    expect(byDay[7]).toEqual([]);
  });

  it('always reports seven days even when the field is absent', async () => {
    routedFetch([json([{ id: 1, country: 'FR' }])]);
    const [point] = await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    expect(point.openingHours).toHaveLength(7);
    expect(point.openingHours.every((d) => d.slots.length === 0)).toBe(true);
  });

  it('skips an entry with no id instead of emitting a broken point', async () => {
    routedFetch([json([{ name: 'no id here' }, ASSUMED_POINT])]);
    const points = await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001' });

    expect(points).toHaveLength(1);
    expect(points[0].id).toBe('1234567');
  });

  it('honours the requested limit', async () => {
    routedFetch([json([ASSUMED_POINT, ASSUMED_LOCKER])]);
    const points = await new SendcloudPickupPointProvider(credentialsService()).searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });

    expect(points).toHaveLength(1);
  });

  it('rejects a point from another carrier on lookup', async () => {
    routedFetch([json({ ...ASSUMED_POINT, carrier: 'colissimo' })]);
    const provider = new SendcloudPickupPointProvider(credentialsService());

    await expect(provider.getPickupPoint('FR', '1234567', 'mondial_relay')).resolves.toBeNull();
  });

  it('accepts a point whose carrier matches the selected method', async () => {
    routedFetch([json(ASSUMED_POINT)]);
    const provider = new SendcloudPickupPointProvider(credentialsService());

    await expect(provider.getPickupPoint('FR', '1234567', 'mondial_relay')).resolves.toMatchObject({ id: '1234567' });
  });
});
