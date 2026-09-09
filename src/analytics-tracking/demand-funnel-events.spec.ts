import { CheckoutStartedListener } from './checkout-started.listener';
import { TestCheckoutGuard } from '../orders/test-checkout-guard.service';

/**
 * Both demand-funnel steps are attributed per product. The test-product report
 * groups behaviour events by productId, so an event written without one — or
 * written for only the first of several products — leaves a column reading 0
 * for activity that genuinely happened.
 */
const ORDER = {
  id: 'o1',
  orderNumber: 'SO-1',
  totalCents: 4990,
  cartToken: 'cart-abc',
  customerId: 'cust-1',
  clientIpAddress: '81.2.69.142',
  clientUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  customerLocale: 'fr',
  isTestOrder: false,
};

describe('checkout_started (reached shipping)', () => {
  function makeListener(items: Array<{ productId: string | null }>) {
    const record = jest.fn(async (_input: Record<string, unknown>) => undefined);
    const prisma = {
      order: { findUnique: jest.fn(async () => ORDER) },
      orderItem: { findMany: jest.fn(async () => items) },
    };
    const listener = new CheckoutStartedListener(prisma as never, { record } as never);
    return { listener, record, prisma };
  }

  it('writes one event per distinct product, so the step is attributable at all', async () => {
    const { listener, record } = makeListener([{ productId: 'p1' }, { productId: 'p2' }]);

    await listener.onOrderCreated({ orderId: 'o1' } as never);

    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls.map(([c]) => (c as { productId: string }).productId).sort()).toEqual(['p1', 'p2']);
  });

  it('carries the client IP, so record() can geolocate the step', async () => {
    const { listener, record } = makeListener([{ productId: 'p1' }]);

    await listener.onOrderCreated({ orderId: 'o1' } as never);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'checkout_started',
        cartToken: 'cart-abc',
        shopCustomerId: 'cust-1',
        clientIp: '81.2.69.142',
        device: 'mobile',
        productId: 'p1',
      }),
    );
  });

  it('never passes userAgent — that argument runs the bot check, and this call site is server-authoritative', async () => {
    const { listener, record } = makeListener([{ productId: 'p1' }]);

    await listener.onOrderCreated({ orderId: 'o1' } as never);

    expect((record.mock.calls[0][0] as Record<string, unknown>).userAgent).toBeUndefined();
  });

  it('still records a cart-level event when no line has a product', async () => {
    const { listener, record } = makeListener([{ productId: null }]);

    await listener.onOrderCreated({ orderId: 'o1' } as never);

    expect(record).toHaveBeenCalledTimes(1);
    expect((record.mock.calls[0][0] as { productId?: string }).productId).toBeUndefined();
  });

  it('does nothing for an order that no longer exists', async () => {
    const record = jest.fn(async (_input: Record<string, unknown>) => undefined);
    const prisma = { order: { findUnique: jest.fn(async () => null) }, orderItem: { findMany: jest.fn() } };
    const listener = new CheckoutStartedListener(prisma as never, { record } as never);

    await listener.onOrderCreated({ orderId: 'gone' } as never);

    expect(record).not.toHaveBeenCalled();
  });
});

describe('test_checkout_blocked (reached checkout)', () => {
  function makeGuard(testProductIds: string[]) {
    const record = jest.fn(async (_input: Record<string, unknown>) => undefined);
    const prisma = {
      order: { findUnique: jest.fn(async () => ORDER), update: jest.fn(async () => ORDER) },
      orderItem: { findMany: jest.fn(async () => testProductIds.map((id) => ({ productId: id }))) },
      product: { findMany: jest.fn(async () => testProductIds.map((id) => ({ id }))) },
    };
    return { guard: new TestCheckoutGuard(prisma as never, { record } as never), record };
  }

  it('writes one event per test product, not just the first', async () => {
    const { guard, record } = makeGuard(['p1', 'p2', 'p3']);

    await expect(guard.assertCheckoutAllowed(ORDER as never)).rejects.toBeDefined();

    expect(record.mock.calls.map(([c]) => (c as { productId: string }).productId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('carries the client context so the block shows up in country breakdowns', async () => {
    const { guard, record } = makeGuard(['p1']);

    await expect(guard.assertCheckoutAllowed(ORDER as never)).rejects.toBeDefined();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'test_checkout_blocked',
        clientIp: '81.2.69.142',
        shopCustomerId: 'cust-1',
        device: 'mobile',
      }),
    );
  });

  it('still blocks the checkout when the analytics write throws', async () => {
    const { guard, record } = makeGuard(['p1']);
    record.mockRejectedValueOnce(new Error('db down'));

    // The throw is the whole point of the guard — a failed demand signal must
    // never turn a blocked test checkout into an allowed one.
    await expect(guard.assertCheckoutAllowed(ORDER as never)).rejects.toBeDefined();
  });
});
