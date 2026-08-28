import { StubPickupPointProvider } from './stub-pickup-point.provider';

describe('StubPickupPointProvider', () => {
  let provider: StubPickupPointProvider;

  beforeEach(() => {
    provider = new StubPickupPointProvider();
  });

  describe('searchPickupPoints', () => {
    it('returns normalized points for a covered country', async () => {
      const points = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 3 });

      expect(points).toHaveLength(3);
      expect(points[0]).toMatchObject({
        country: 'FR',
        postcode: '75001',
        type: expect.stringMatching(/^(relay|locker)$/),
      });
    });

    it('marks every fixture as test data and claims no real position', async () => {
      // The stub renders through the real checkout UI, so a point must never
      // be mistakable for a carrier result.
      const points = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 3 });

      for (const point of points) {
        expect(point.name).toContain('[TEST DATA]');
        expect(point.address).toMatch(/not a real location/i);
        expect(point.latitude).toBeNull();
        expect(point.longitude).toBeNull();
        expect(point.distanceMeters).toBeNull();
      }
      // Every field of the normalized contract is present, so the domain layer
      // never has to guard for a carrier-specific gap.
      expect(Object.keys(points[0]).sort()).toEqual(
        ['address', 'carrierCode', 'city', 'country', 'distanceMeters', 'id', 'latitude', 'longitude', 'name', 'openingHours', 'postcode', 'type'].sort(),
      );
    });

    it('returns an empty list for a country the network does not cover', async () => {
      expect(await provider.searchPickupPoints({ country: 'US', postcode: '10001' })).toEqual([]);
    });

    it('accepts a lower-case country code', async () => {
      expect(await provider.searchPickupPoints({ country: 'fr', postcode: '75001' })).not.toHaveLength(0);
    });

    it('caps results at the requested limit', async () => {
      expect(await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 2 })).toHaveLength(2);
    });

    it('exposes seven opening-hours days, with a closed day as an empty slot list', async () => {
      const [point] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });

      expect(point.openingHours.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(point.openingHours.find((d) => d.weekday === 7)?.slots).toEqual([]);
      expect(point.openingHours.find((d) => d.weekday === 1)?.slots).toEqual(['09:00-12:30', '14:00-19:00']);
    });

    it('is deterministic — the same query yields the same points', async () => {
      const first = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 3 });
      const second = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 3 });
      expect(first).toEqual(second);
    });
  });

  describe('getPickupPoint', () => {
    it('round-trips an id returned by a search', async () => {
      const [searched] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });
      expect(await provider.getPickupPoint('FR', searched.id)).toEqual(searched);
    });

    it('returns null for an unknown id rather than throwing', async () => {
      expect(await provider.getPickupPoint('FR', 'not-a-fixture-id')).toBeNull();
    });

    it('returns null when the id belongs to a different country', async () => {
      const [french] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });
      expect(await provider.getPickupPoint('BE', french.id)).toBeNull();
    });

    it('returns null for an uncovered country', async () => {
      expect(await provider.getPickupPoint('US', 'US-10001-0')).toBeNull();
    });
  });

  describe('carrier filter', () => {
    it('echoes the requested carrier back on every point', async () => {
      const points = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', carrierCode: 'mondial_relay', limit: 2 });
      expect(points.every((p) => p.carrierCode === 'mondial_relay')).toBe(true);
    });

    it('reports no carrier when the search did not filter by one', async () => {
      const [point] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });
      expect(point.carrierCode).toBeNull();
    });
  });

  describe('validatePickupPoint', () => {
    it('accepts a point that still exists in the same country', async () => {
      const [point] = await provider.searchPickupPoints({ country: 'BE', postcode: '1000', limit: 1 });
      await expect(provider.validatePickupPoint('BE', point.id)).resolves.toEqual(point);
    });

    it('rejects a point once the destination country changes', async () => {
      const [point] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });
      await expect(provider.validatePickupPoint('ES', point.id)).resolves.toBeNull();
    });
  });
});
