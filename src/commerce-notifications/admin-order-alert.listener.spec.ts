import { AdminOrderAlertListener } from './admin-order-alert.listener';

describe('AdminOrderAlertListener — order_cancelled', () => {
  function make() {
    const notify = jest.fn(async () => undefined);
    const prisma = { order: { findUnique: jest.fn(async () => ({ orderNumber: 'SO-1', customerEmail: 'a@b.c' })) } };
    return { listener: new AdminOrderAlertListener(prisma as never, { notify } as never), notify };
  }

  it('does not alert the desk about a cancellation an admin made by hand', async () => {
    const { listener, notify } = make();
    await listener.onStatusChanged({ orderId: 'o1', fromStatus: 'paid', toStatus: 'cancelled', triggeredBy: 'admin' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not alert about a draft rebuilt because the cart changed (silent)', async () => {
    const { listener, notify } = make();
    await listener.onStatusChanged({ orderId: 'o1', fromStatus: 'draft', toStatus: 'cancelled', triggeredBy: 'system', silent: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('still alerts when the system cancels (payment failed, reservation expired)', async () => {
    const { listener, notify } = make();
    await listener.onStatusChanged({ orderId: 'o1', fromStatus: 'awaiting_payment', toStatus: 'cancelled', triggeredBy: 'system' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'order_cancelled', orderNumber: 'SO-1' }));
  });
});
