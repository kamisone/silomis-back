import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PickupPointsService } from './pickup-points.service';
import { StubPickupPointProvider } from './providers/stub-pickup-point.provider';
import { PickupPointProvider } from './providers/pickup-point.provider';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal Prisma stand-in — only the one query the service makes. */
function prismaWith(shippingAddressSnapshot: unknown): PrismaService {
  return {
    order: {
      findUnique: jest.fn().mockResolvedValue(shippingAddressSnapshot === undefined ? null : { shippingAddressSnapshot }),
    },
  } as unknown as PrismaService;
}

const ORDER_ID = '3f1e4c2a-0b6d-4f8e-9a71-2c5d8e0f1a3b';

describe('PickupPointsService', () => {
  let provider: StubPickupPointProvider;

  beforeEach(() => {
    provider = new StubPickupPointProvider();
  });

  describe('countryForOrder', () => {
    it('reads the country from the order address, upper-cased', async () => {
      const service = new PickupPointsService(prismaWith({ country: 'fr' }), provider);
      await expect(service.countryForOrder(ORDER_ID)).resolves.toBe('FR');
    });

    it('rejects an order with no address yet', async () => {
      const service = new PickupPointsService(prismaWith({}), provider);
      await expect(service.countryForOrder(ORDER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown order', async () => {
      const service = new PickupPointsService(prismaWith(undefined), provider);
      await expect(service.countryForOrder(ORDER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('searchForOrder', () => {
    it('searches the order address country, ignoring any country the caller supplies', async () => {
      const spy = jest.spyOn(provider, 'searchPickupPoints');
      const service = new PickupPointsService(prismaWith({ country: 'BE' }), provider);

      // A caller trying to smuggle a country in through the search terms.
      await service.searchForOrder(ORDER_ID, { postcode: '1000', country: 'FR' } as never);

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ country: 'BE', postcode: '1000' }));
    });

    it('clamps an oversized limit', async () => {
      const spy = jest.spyOn(provider, 'searchPickupPoints');
      const service = new PickupPointsService(prismaWith({ country: 'FR' }), provider);

      await service.searchForOrder(ORDER_ID, { postcode: '75001', limit: 5000 });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    });

    it('returns an empty list for a destination the carrier does not serve', async () => {
      const service = new PickupPointsService(prismaWith({ country: 'US' }), provider);
      await expect(service.searchForOrder(ORDER_ID, { postcode: '10001' })).resolves.toEqual([]);
    });
  });

  describe('resolveForOrder', () => {
    it('re-reads the point from the carrier and stamps selectedAt', async () => {
      const service = new PickupPointsService(prismaWith({ country: 'FR' }), provider);
      const [point] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });

      const snapshot = await service.resolveForOrder(ORDER_ID, point.id);

      expect(snapshot).toMatchObject({ ...point });
      expect(Date.parse(snapshot.selectedAt)).not.toBeNaN();
    });

    it('ignores client-supplied detail — every stored field comes from the carrier', async () => {
      const service = new PickupPointsService(prismaWith({ country: 'FR' }), provider);
      const [point] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });

      const snapshot = await service.resolveForOrder(ORDER_ID, point.id);

      expect(snapshot.name).toBe(point.name);
      expect(snapshot.address).toBe(point.address);
    });

    it('rejects a point that does not exist', async () => {
      const service = new PickupPointsService(prismaWith({ country: 'FR' }), provider);
      await expect(service.resolveForOrder(ORDER_ID, 'FR-75001-999')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a point chosen before the customer changed country', async () => {
      const [french] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });
      // Same order id, but the address now says Spain.
      const service = new PickupPointsService(prismaWith({ country: 'ES' }), provider);

      await expect(service.resolveForOrder(ORDER_ID, french.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a foreign point even if the provider were to return one', async () => {
      const [french] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });
      // A misbehaving provider that ignores the country argument entirely.
      const rogue: PickupPointProvider = {
        searchPickupPoints: () => Promise.resolve([]),
        listLocalities: () => Promise.resolve([]),
        getPickupPoint: () => Promise.resolve(french),
        validatePickupPoint: () => Promise.resolve(french),
      };
      const service = new PickupPointsService(prismaWith({ country: 'BE' }), rogue);

      await expect(service.resolveForOrder(ORDER_ID, french.id)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('revalidateSnapshot', () => {
    it('re-checks a stored snapshot against the carrier', async () => {
      const service = new PickupPointsService(prismaWith({ country: 'FR' }), provider);
      const [point] = await provider.searchPickupPoints({ country: 'FR', postcode: '75001', limit: 1 });

      await expect(service.revalidateSnapshot(ORDER_ID, { id: point.id })).resolves.toMatchObject({ id: point.id });
    });

    it('rejects a missing selection', async () => {
      const service = new PickupPointsService(prismaWith({ country: 'FR' }), provider);
      await expect(service.revalidateSnapshot(ORDER_ID, null)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a snapshot whose point has since closed', async () => {
      const closed: PickupPointProvider = {
        searchPickupPoints: () => Promise.resolve([]),
        listLocalities: () => Promise.resolve([]),
        getPickupPoint: () => Promise.resolve(null),
        validatePickupPoint: () => Promise.resolve(null),
      };
      const service = new PickupPointsService(prismaWith({ country: 'FR' }), closed);

      await expect(service.revalidateSnapshot(ORDER_ID, { id: 'FR-75001-0' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
