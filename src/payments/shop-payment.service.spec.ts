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

/**
 * Checkout takes cards only: no Link, no wallets-by-dashboard, nothing else the
 * account happens to have switched on.
 */
describe('ShopPaymentService.createPaymentIntent — payment methods', () => {
  function makeIntentService(existing: Record<string, unknown> | null) {
    const order = { id: 'o1', orderNumber: 'ORD-1', status: 'awaiting_payment', totalCents: 990, paymentIntentId: existing ? 'pi_1' : null };
    const stripe = {
      paymentIntents: {
        retrieve: jest.fn(async () => existing),
        create: jest.fn(async () => ({ id: 'pi_new', client_secret: 'cs_new' })),
        update: jest.fn(async () => ({ id: 'pi_1', client_secret: 'cs_1' })),
        cancel: jest.fn(async () => ({ id: 'pi_1', status: 'canceled' })),
      },
    };
    const prisma = { order: { findUnique: jest.fn(async () => order), update: jest.fn(async () => order) } };
    const s = new ShopPaymentService(
      stripe as never, prisma as never, { extendReservation: jest.fn() } as never,
      { assertCheckoutAllowed: jest.fn() } as never, {} as never, {} as never, {} as never, {} as never,
    );
    return { s, stripe };
  }
  const automatic = { automatic_payment_methods: { enabled: true } };

  it('lets the dashboard decide the methods, minus the ones that settle days later', async () => {
    const { s, stripe } = makeIntentService(null);
    await s.createPaymentIntent('o1');
    const [params, opts] = stripe.paymentIntents.create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params).not.toHaveProperty('payment_method_types');
    expect(params).toMatchObject({ ...automatic, excluded_payment_method_types: expect.arrayContaining(['sepa_debit', 'multibanco', 'customer_balance']) });
    expect(opts).toEqual({ idempotencyKey: 'shop-order-o1' });
  });

  it('replaces a card-only intent nobody is paying on, under a fresh idempotency key', async () => {
    const { s, stripe } = makeIntentService({ id: 'pi_1', status: 'requires_payment_method', amount: 990, payment_method_types: ['card'], automatic_payment_methods: null });
    const res = await s.createPaymentIntent('o1');
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_1');
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining(automatic), { idempotencyKey: 'shop-order-o1-after-pi_1' });
    expect(res.clientSecret).toBe('cs_new');
  });

  it('never replaces a card-only intent mid-3-D Secure', async () => {
    const { s, stripe } = makeIntentService({ id: 'pi_1', client_secret: 'cs_1', status: 'requires_action', amount: 990, payment_method_types: ['card'], automatic_payment_methods: null });
    const res = await s.createPaymentIntent('o1');
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(res.clientSecret).toBe('cs_1');
  });

  it('reuses a current intent at the right amount untouched', async () => {
    const { s, stripe } = makeIntentService({ id: 'pi_1', client_secret: 'cs_1', status: 'requires_payment_method', amount: 990, ...automatic });
    const res = await s.createPaymentIntent('o1');
    expect(stripe.paymentIntents.update).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(res.clientSecret).toBe('cs_1');
  });

  it('re-syncs the amount on a current intent when the total moved', async () => {
    const { s, stripe } = makeIntentService({ id: 'pi_1', client_secret: 'cs_1', status: 'requires_payment_method', amount: 500, ...automatic });
    await s.createPaymentIntent('o1');
    expect(stripe.paymentIntents.update).toHaveBeenCalledWith('pi_1', { amount: 990 });
  });

  it('creates a new intent when the old one was cancelled, without reusing its key', async () => {
    const { s, stripe } = makeIntentService({ id: 'pi_1', status: 'canceled', amount: 990, ...automatic });
    await s.createPaymentIntent('o1');
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: 'shop-order-o1-after-pi_1' });
  });
});

describe('ShopPaymentService — a failed payment attempt', () => {
  function makeFailService(opts: { failedRows?: number } = {}) {
    const prisma = {
      paymentTransaction: {
        create: jest.fn(async () => ({})),
        findFirst: jest.fn(async () => (opts.failedRows ? { id: 'tx1' } : null)),
      },
      order: { findUnique: jest.fn() },
    };
    const ordersService = { transition: jest.fn(), extendReservation: jest.fn(async () => undefined) };
    const eventBus = { emit: jest.fn() };
    const s = new ShopPaymentService({} as never, prisma as never, ordersService as never, {} as never, eventBus as never, {} as never, {} as never, {} as never);
    return { s, ordersService, eventBus };
  }
  const failedEvent = { id: 'evt_1', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_1', amount: 990, currency: 'eur', metadata: { orderId: 'o1' }, last_payment_error: { code: 'card_declined' } } } };

  it('keeps the order open for a retry and restarts its reservation — no cancel, no email yet', async () => {
    const { s, ordersService, eventBus } = makeFailService();
    await (s as unknown as { handlePaymentFailed(e: unknown): Promise<void> }).handlePaymentFailed(failedEvent);
    expect(ordersService.transition).not.toHaveBeenCalled();
    expect(ordersService.extendReservation).toHaveBeenCalledWith('o1');
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('announces the failure once the reservation timer gives up, only if an attempt failed', async () => {
    const failed = makeFailService({ failedRows: 1 });
    await failed.s.announceFailedPaymentIfAny('o1', 'pi_1');
    expect(failed.eventBus.emit).toHaveBeenCalledWith('commerce.payment.failed', { orderId: 'o1', paymentIntentId: 'pi_1' }, expect.anything());

    const abandoned = makeFailService();
    await abandoned.s.announceFailedPaymentIfAny('o1', 'pi_1');
    expect(abandoned.eventBus.emit).not.toHaveBeenCalled();
  });
});
