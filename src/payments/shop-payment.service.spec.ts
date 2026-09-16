import { ShopPaymentService } from './shop-payment.service';
import { Prisma } from '../../generated/prisma/client';

/**
 * The webhook is the normal path; these specs are about the net under it —
 * an order Stripe has been paid for that nobody told the shop about.
 */
function makeService(opts: { orderStatus?: string; intentStatus?: string; ledgered?: boolean; intentOrderId?: string } = {}) {
  const { orderStatus = 'awaiting_payment', intentStatus = 'succeeded', ledgered = false, intentOrderId = 'o1' } = opts;
  const order = { id: 'o1', orderNumber: 'ORD-1', status: orderStatus, paymentIntentId: 'pi_1' };
  const created: unknown[] = [];
  const prisma = {
    order: {
      findUnique: jest.fn(async () => order),
      findMany: jest.fn(async () => [{ id: 'o1' }]),
    },
    paymentTransaction: {
      create: jest.fn(async ({ data }: { data: unknown }) => {
        if (ledgered) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        created.push(data);
        return data;
      }),
    },
  };
  const stripe = { paymentIntents: { retrieve: jest.fn(async () => ({ id: 'pi_1', status: intentStatus, amount: 990, currency: 'eur', metadata: { orderId: intentOrderId } })) } };
  const ordersService = {
    confirmPayment: jest.fn(async () => {
      order.status = 'paid';
      return order;
    }),
  };
  const eventBus = { emit: jest.fn() };
  const notifications = { notify: jest.fn(async () => undefined) };
  const s = new ShopPaymentService(stripe as never, prisma as never, ordersService as never, {} as never, eventBus as never, {} as never, {} as never, notifications as never);
  return { s, prisma, stripe, ordersService, eventBus, notifications, created, order };
}

describe('ShopPaymentService.reconcileOrder', () => {
  it('settles an order Stripe says is paid when no webhook did', async () => {
    const { s, ordersService, eventBus, created } = makeService();
    const res = await s.reconcileOrder('o1');

    expect(res).toEqual({ status: 'paid', reconciled: true });
    expect(ordersService.confirmPayment).toHaveBeenCalledWith('o1', 'pi_1');
    expect(eventBus.emit).toHaveBeenCalledWith('commerce.payment.succeeded', expect.objectContaining({ orderId: 'o1', amountCents: 990 }), expect.anything());
    // Keyed on the intent, so the webhook that arrives later is a no-op.
    expect(created[0]).toMatchObject({ webhookEventId: 'pi:pi_1', providerTransactionId: 'pi_1' });
  });

  it('does nothing while Stripe has not been paid', async () => {
    const { s, ordersService } = makeService({ intentStatus: 'requires_payment_method' });
    expect(await s.reconcileOrder('o1')).toEqual({ status: 'awaiting_payment', reconciled: false });
    expect(ordersService.confirmPayment).not.toHaveBeenCalled();
  });

  it('leaves a paid order alone, and never touches a shipped one', async () => {
    const { s, stripe } = makeService({ orderStatus: 'shipped' });
    expect(await s.reconcileOrder('o1')).toEqual({ status: 'shipped', reconciled: false });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it('follows through on an order the ledger already knows but that never became paid', async () => {
    const { s, ordersService } = makeService({ ledgered: true });
    const res = await s.reconcileOrder('o1');
    expect(ordersService.confirmPayment).toHaveBeenCalled();
    expect(res.status).toBe('paid');
  });

  it('refuses an intent that belongs to another order', async () => {
    const { s, ordersService } = makeService({ intentOrderId: 'someone-else' });
    await s.reconcileOrder('o1');
    expect(ordersService.confirmPayment).not.toHaveBeenCalled();
  });

  it('alerts the desk when the money is there but the order cannot be paid', async () => {
    const { s, ordersService, notifications } = makeService({ orderStatus: 'cancelled' });
    ordersService.confirmPayment.mockRejectedValueOnce(new Error('cancelled by hand'));
    const res = await s.reconcileOrder('o1');
    expect(res.reconciled).toBe(false);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'payment_succeeded', summary: expect.stringContaining('ATTENTION') }));
  });
});

describe('ShopPaymentService.intentState', () => {
  it('reports a payment still in flight so the reservation timer waits', async () => {
    const { s } = makeService({ intentStatus: 'processing' });
    expect(await s.intentState('o1')).toBe('processing');
  });

  it('settles on the spot when the money is already there', async () => {
    const { s, ordersService } = makeService();
    expect(await s.intentState('o1')).toBe('succeeded');
    expect(ordersService.confirmPayment).toHaveBeenCalled();
  });
});
