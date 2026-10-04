import { ReplayAdminService } from './replay-admin.service';

/**
 * The replay list's per-row trail: which behaviour events and orders belong to
 * which session. The prisma fakes return everything; the service is what has
 * to tell sessions apart.
 */
const T0 = new Date('2026-10-01T10:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

const session = {
  id: 's1',
  productId: 'p1',
  productIsTest: true,
  cartToken: 'cart-a',
  visitorHash: 'hash-a',
  startedAt: T0,
  lastEventAt: at(5),
  endedAt: at(5),
  viewedAt: null,
};

function makeService(events: unknown[], orders: unknown[]) {
  const prisma = {
    replaySession: { findMany: jest.fn(async () => [session]), count: jest.fn(async () => 1) },
    product: { findMany: jest.fn(async () => [{ id: 'p1', title: 'Cap' }]) },
    shopBehaviorEvent: { findMany: jest.fn(async () => events) },
    order: { findMany: jest.fn(async () => orders) },
  };
  return new ReplayAdminService(prisma as never, null as never);
}

const ev = (eventType: string, min: number, extra: Record<string, unknown> = {}) => ({ eventType, cartToken: 'cart-a', visitorHash: 'hash-a', productId: 'p1', createdAt: at(min), ...extra });
const window = { since: at(-60), until: at(60), days: 1 };

describe('ReplayAdminService.list — session activity', () => {
  it('collapses the visitor’s events per type, in first-seen order', async () => {
    const service = makeService(
      [ev('product_view', 0), ev('product_view', 1), ev('add_to_cart', 2), ev('checkout_started', 4), ev('test_checkout_blocked', 6)],
      [],
    );

    const { items } = await service.list(window);

    expect(items[0].activity.map((a) => [a.type, a.count])).toEqual([
      ['product_view', 2],
      ['add_to_cart', 1],
      ['checkout_started', 1],
      ['test_checkout_blocked', 1],
    ]);
  });

  it('falls back to the visitor hash for token-less events, but drops another cart behind the same IP', async () => {
    const service = makeService([ev('product_view', 0, { cartToken: null }), ev('add_to_cart', 1, { cartToken: 'cart-b' })], []);

    const { items } = await service.list(window);

    expect(items[0].activity.map((a) => a.type)).toEqual(['product_view']);
  });

  it('ignores other products and events outside the session’s span', async () => {
    const service = makeService([ev('add_to_cart', 1, { productId: 'p2' }), ev('product_view', -5), ev('add_to_cart', 120)], []);

    const { items } = await service.list(window);

    expect(items[0].activity).toEqual([]);
  });

  it('links the cart’s orders whatever their status, including a resumed draft', async () => {
    const service = makeService(
      [],
      [
        { id: 'o1', orderNumber: 'SO-1', status: 'cancelled', cartToken: 'cart-a', createdAt: at(4), updatedAt: at(50) },
        { id: 'o2', orderNumber: 'SO-2', status: 'draft', cartToken: 'cart-a', createdAt: at(-600), updatedAt: at(3) },
        { id: 'o3', orderNumber: 'SO-3', status: 'paid', cartToken: 'cart-a', createdAt: at(-900), updatedAt: at(-800) },
        { id: 'o4', orderNumber: 'SO-4', status: 'draft', cartToken: 'cart-b', createdAt: at(4), updatedAt: at(4) },
      ],
    );

    const { items } = await service.list(window);

    expect(items[0].orders.map((o) => [o.orderNumber, o.status])).toEqual([
      ['SO-1', 'cancelled'],
      ['SO-2', 'draft'],
    ]);
  });
});
