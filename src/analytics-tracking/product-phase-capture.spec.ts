import { BehaviorTrackingService } from './behavior-tracking.service';

/**
 * The demand report is split into a Tests tab and a Live tab, and one toggle
 * moves a product between them. The tab an event belongs to therefore has to
 * be decided when the event is written — deriving it later from the product's
 * flag would make that toggle rewrite history.
 */
function makeService(isTestProduct: boolean | null) {
  const create = jest.fn(async (_args: { data: Record<string, unknown> }) => undefined);
  const findUnique = jest.fn(async () => (isTestProduct === null ? null : { isTestProduct }));
  const prisma = { shopBehaviorEvent: { create }, product: { findUnique } };
  const platformSettings = { isAnalyticsExcluded: () => false, isBotUserAgent: () => false };
  const geoIp = { visitorHash: () => null, countryFromIp: () => null };

  const service = new BehaviorTrackingService(prisma as never, platformSettings as never, geoIp as never);
  const written = () => create.mock.calls.map(([a]) => a.data);
  return { service, written, findUnique };
}

describe('product phase captured on the event', () => {
  it('records a test product’s event as test-phase', async () => {
    const { service, written } = makeService(true);

    await service.record({ eventType: 'product_view', productId: 'p1' });

    expect(written()[0].productIsTest).toBe(true);
  });

  it('records a live product’s event as live-phase', async () => {
    const { service, written } = makeService(false);

    await service.record({ eventType: 'product_view', productId: 'p1' });

    expect(written()[0].productIsTest).toBe(false);
  });

  it('leaves the phase null for a cart-level event with no product', async () => {
    const { service, written, findUnique } = makeService(true);

    await service.record({ eventType: 'checkout_started', cartToken: 'c1' });

    expect(written()[0].productIsTest).toBeNull();
    // Nothing to look up, so nothing is looked up.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('leaves it null for a product that no longer exists rather than guessing a phase', async () => {
    const { service, written } = makeService(null);

    await service.record({ eventType: 'product_view', productId: 'gone' });

    expect(written()[0].productIsTest).toBeNull();
  });

  it('reads the flag once per product, not once per event', async () => {
    const { service, findUnique } = makeService(true);

    for (let i = 0; i < 5; i++) await service.record({ eventType: 'product_view', productId: 'p1' });

    // record() is on the hot path — a view is written for every page load, and
    // a lookup apiece would double the write path's query count.
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('caches per product, so a second product is still resolved', async () => {
    const { service, findUnique, written } = makeService(true);

    await service.record({ eventType: 'product_view', productId: 'p1' });
    await service.record({ eventType: 'product_view', productId: 'p2' });

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(written().every((d) => d.productIsTest === true)).toBe(true);
  });

  it('still writes the event when the phase lookup throws', async () => {
    const create = jest.fn(async () => undefined);
    const prisma = {
      shopBehaviorEvent: { create },
      product: { findUnique: jest.fn(async () => { throw new Error('db down'); }) },
    };
    const service = new BehaviorTrackingService(
      prisma as never,
      { isAnalyticsExcluded: () => false, isBotUserAgent: () => false } as never,
      { visitorHash: () => null, countryFromIp: () => null } as never,
    );

    await service.record({ eventType: 'product_view', productId: 'p1' });

    // record() swallows its own failures by design — analytics must never break
    // the customer's action — but a phase lookup failing should not also cost
    // the event itself.
    expect(create).toHaveBeenCalled();
  });
});
