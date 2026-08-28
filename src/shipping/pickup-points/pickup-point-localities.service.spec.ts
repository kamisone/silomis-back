import { PickupPointLocalitiesService } from './pickup-point-localities.service';
import { PickupPointProvider } from './providers/pickup-point.provider';
import { PickupPointLocality } from './pickup-point.types';
import { RedisService } from '../../redis/redis.service';

const INDEX: PickupPointLocality[] = [
  { city: 'Paris', postcode: '75001', count: 12 },
  { city: 'Paris', postcode: '75010', count: 4 },
  { city: 'Pantin', postcode: '93500', count: 3 },
  { city: 'Saint-Denis', postcode: '93200', count: 7 },
  { city: 'Lyon', postcode: '69001', count: 9 },
];

/** In-memory Redis stand-in; `broken` simulates an unreachable cache. */
function fakeRedis(broken = false) {
  const store = new Map<string, string>();
  return {
    store,
    service: {
      client: {
        get: jest.fn((k: string) => (broken ? Promise.reject(new Error('down')) : Promise.resolve(store.get(k) ?? null))),
        set: jest.fn((k: string, v: string) => {
          if (broken) return Promise.reject(new Error('down'));
          store.set(k, v);
          return Promise.resolve('OK');
        }),
      },
    } as unknown as RedisService,
  };
}

function fakeProvider(localities: PickupPointLocality[] = INDEX) {
  const listLocalities = jest.fn().mockResolvedValue(localities);
  return {
    listLocalities,
    provider: {
      searchPickupPoints: () => Promise.resolve([]),
      listLocalities,
      getPickupPoint: () => Promise.resolve(null),
      validatePickupPoint: () => Promise.resolve(null),
    } as PickupPointProvider,
  };
}

describe('PickupPointLocalitiesService', () => {
  describe('prefix matching', () => {
    const suggest = (q: string) => {
      const { service } = fakeRedis();
      const { provider } = fakeProvider();
      return new PickupPointLocalitiesService(service, provider).suggest('FR', 'mondial_relay', q);
    };

    it('matches from a single character', async () => {
      const results = await suggest('p');
      expect(results.map((r) => r.city)).toEqual(expect.arrayContaining(['Paris', 'Pantin']));
    });

    it('matches a partial city name, which is the whole point', async () => {
      expect((await suggest('par')).every((r) => r.city === 'Paris')).toBe(true);
    });

    it('matches a postcode prefix', async () => {
      const results = await suggest('750');
      expect(results.map((r) => r.postcode)).toEqual(['75001', '75010']);
    });

    it('ranks a postcode prefix above a city-name match', async () => {
      // "93" is a postcode prefix for two places and a city prefix for none.
      const results = await suggest('93');
      expect(results.every((r) => r.postcode.startsWith('93'))).toBe(true);
    });

    it('falls back to a substring match inside a city name', async () => {
      expect((await suggest('denis')).map((r) => r.city)).toEqual(['Saint-Denis']);
    });

    it('is case-insensitive and ignores surrounding whitespace', async () => {
      expect((await suggest('  LYON ')).map((r) => r.city)).toEqual(['Lyon']);
    });

    it('orders equally-good matches by how many points the place has', async () => {
      const results = await suggest('paris');
      expect(results.map((r) => r.postcode)).toEqual(['75001', '75010']);
    });

    it('returns nothing for an empty query rather than the whole index', async () => {
      expect(await suggest('   ')).toEqual([]);
    });

    it('returns nothing when nothing matches', async () => {
      expect(await suggest('zzzz')).toEqual([]);
    });

    it('caps the number of suggestions', async () => {
      const many = Array.from({ length: 50 }, (_, i) => ({ city: `Ville${i}`, postcode: `7500${i}`, count: 1 }));
      const { service } = fakeRedis();
      const { provider } = fakeProvider(many);

      expect(await new PickupPointLocalitiesService(service, provider).suggest('FR', null, 'ville')).toHaveLength(8);
    });
  });

  describe('caching', () => {
    it('builds the index once and serves later keystrokes from cache', async () => {
      const { service } = fakeRedis();
      const { provider, listLocalities } = fakeProvider();
      const svc = new PickupPointLocalitiesService(service, provider);

      await svc.suggest('FR', 'mondial_relay', 'p');
      await svc.suggest('FR', 'mondial_relay', 'pa');
      await svc.suggest('FR', 'mondial_relay', 'par');

      expect(listLocalities).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates concurrent builds on a cold cache', async () => {
      const { service } = fakeRedis();
      const { provider, listLocalities } = fakeProvider();
      const svc = new PickupPointLocalitiesService(service, provider);

      await Promise.all([svc.suggest('FR', null, 'p'), svc.suggest('FR', null, 'a'), svc.suggest('FR', null, 'l')]);

      expect(listLocalities).toHaveBeenCalledTimes(1);
    });

    it('keys the index by country and carrier', async () => {
      const { service, store } = fakeRedis();
      const { provider } = fakeProvider();
      const svc = new PickupPointLocalitiesService(service, provider);

      await svc.suggest('FR', 'mondial_relay', 'p');
      await svc.suggest('BE', 'mondial_relay', 'p');
      await svc.suggest('FR', 'colissimo', 'p');

      expect([...store.keys()].sort()).toEqual([
        'pickup:localities:BE:mondial_relay',
        'pickup:localities:FR:colissimo',
        'pickup:localities:FR:mondial_relay',
      ]);
    });

    it('still answers when Redis is unreachable', async () => {
      const { service } = fakeRedis(true);
      const { provider } = fakeProvider();

      // Degrades to rebuilding per call rather than failing the request.
      await expect(new PickupPointLocalitiesService(service, provider).suggest('FR', null, 'par')).resolves.toHaveLength(2);
    });
  });

  describe('providers without bulk support', () => {
    it('yields no suggestions instead of breaking the picker', async () => {
      const { service } = fakeRedis();
      const { provider } = fakeProvider([]);

      await expect(new PickupPointLocalitiesService(service, provider).suggest('FR', null, 'par')).resolves.toEqual([]);
    });

    it('does not re-ask on every keystroke after an empty answer', async () => {
      const { service } = fakeRedis();
      const { provider, listLocalities } = fakeProvider([]);
      const svc = new PickupPointLocalitiesService(service, provider);

      await svc.suggest('FR', null, 'p');
      await svc.suggest('FR', null, 'pa');

      expect(listLocalities).toHaveBeenCalledTimes(1);
    });
  });
});
