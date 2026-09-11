import { ReplayTrackingService } from './replay-tracking.service';

/**
 * Recording now covers the live catalogue, not just test products. The phase is
 * snapshotted on the session so promoting a product never moves its existing
 * recordings between the Tests and Live tabs.
 */
function makeService(product: { isTestProduct: boolean; status?: string; deletedAt?: Date | null } | null) {
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data }));
  const prisma = {
    product: { findUnique: jest.fn(async () => product) },
    replaySession: { create },
  };
  const platformSettings = { isAnalyticsExcluded: () => false, isBotUserAgent: () => false };
  const geoIp = { visitorHash: () => null, countryFromIp: () => null };

  const service = new ReplayTrackingService(prisma as never, null as never, platformSettings as never, geoIp as never);
  return { service, create };
}

const META = { ip: '81.2.69.142', device: 'mobile', source: null };
const DTO = { productId: 'p1' } as never;

describe('replay recording scope', () => {
  it('records a live product — the whole point of the change', async () => {
    const { service, create } = makeService({ isTestProduct: false, status: 'active', deletedAt: null });

    const res = await service.startSession(DTO, META);

    expect(res.sessionId).toBeDefined();
    expect(create.mock.calls[0][0].data.productIsTest).toBe(false);
  });

  it('still records a test product, and tags it as such', async () => {
    const { service, create } = makeService({ isTestProduct: true, status: 'active', deletedAt: null });

    await service.startSession(DTO, META);

    expect(create.mock.calls[0][0].data.productIsTest).toBe(true);
  });

  it('records nothing for a product that does not exist', async () => {
    const { service, create } = makeService(null);

    expect(await service.startSession(DTO, META)).toEqual({});
    expect(create).not.toHaveBeenCalled();
  });

  it('records nothing for a draft or archived product', async () => {
    // The client names the product, so an inactive one reaching here means a
    // stale page or a forged claim — neither is worth a recording.
    const { service, create } = makeService({ isTestProduct: false, status: 'draft', deletedAt: null });

    expect(await service.startSession(DTO, META)).toEqual({});
    expect(create).not.toHaveBeenCalled();
  });

  it('records nothing for a soft-deleted product', async () => {
    const { service, create } = makeService({ isTestProduct: false, status: 'active', deletedAt: new Date() });

    expect(await service.startSession(DTO, META)).toEqual({});
    expect(create).not.toHaveBeenCalled();
  });

  it('never records when the visitor is on the analytics exclusion list', async () => {
    const prisma = { product: { findUnique: jest.fn() }, replaySession: { create: jest.fn() } };
    const service = new ReplayTrackingService(
      prisma as never,
      null as never,
      { isAnalyticsExcluded: () => true, isBotUserAgent: () => false } as never,
      {} as never,
    );

    expect(await service.startSession(DTO, META)).toEqual({});
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });
});
