import { CustomerSmsService } from './customer-sms.service';
import { isStopReply, renderAbandonedCartSms, renderCustomerSms } from './customer-sms-copy';

function makeService(setting?: string, optedOut = false) {
  const prisma = {
    platformSettings: { findUnique: jest.fn().mockResolvedValue(setting === undefined ? null : { value: setting }) },
    commerceNotificationLog: { create: jest.fn().mockResolvedValue({}) },
    smsOptOut: { findUnique: jest.fn().mockResolvedValue(optedOut ? { phone: '+33612345678' } : null), upsert: jest.fn().mockResolvedValue({}) },
  };
  const sms = { addMessage: jest.fn().mockResolvedValue({}) };
  const service = new CustomerSmsService(prisma as never, sms as never);
  return { service, prisma, sms };
}

const order = { id: 'o1', orderNumber: 'ORD-000123', customerPhone: '+33612345678', customerLocale: 'fr' };

describe('CustomerSmsService', () => {
  it('texts the order phone in the order language and logs it as a customer event', async () => {
    const { service, sms, prisma } = makeService();

    await service.send('order_shipped', order, 'https://x.test/t');

    expect(sms.addMessage).toHaveBeenCalledWith('+33612345678', expect.stringContaining('ORD-000123 est expédiée'));
    expect(sms.addMessage.mock.calls[0][1]).toMatch(/\nhttps:\/\/x\.test\/t$/);
    expect(prisma.commerceNotificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: 'customer_order_shipped', channel: 'sms', status: 'sent', orderId: 'o1' }),
    });
  });

  it('does nothing for an order without a phone', async () => {
    const { service, sms, prisma } = makeService();
    await service.send('order_confirmed', { ...order, customerPhone: null }, null);
    expect(sms.addMessage).not.toHaveBeenCalled();
    expect(prisma.commerceNotificationLog.create).not.toHaveBeenCalled();
  });

  it('skips, and says why, when the admin switched customer SMS off', async () => {
    const { service, sms, prisma } = makeService('false');
    await service.send('order_confirmed', order, null);
    expect(sms.addMessage).not.toHaveBeenCalled();
    expect(prisma.commerceNotificationLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'skipped' }) });
  });

  it('does not dial a number that never got a country code', async () => {
    const { service, sms } = makeService();
    await service.send('order_confirmed', { ...order, customerPhone: '0612345678' }, null);
    expect(sms.addMessage).not.toHaveBeenCalled();
  });

  it('logs a gateway failure instead of throwing', async () => {
    const { service, sms, prisma } = makeService();
    sms.addMessage.mockRejectedValue(new Error('db down'));
    await expect(service.send('order_confirmed', order, null)).resolves.toBeUndefined();
    expect(prisma.commerceNotificationLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'failed', error: 'db down' }) });
  });
});

describe('renderCustomerSms', () => {
  it('drops the link label when there is no link', () => {
    expect(renderCustomerSms('order_cancelled', 'ORD-1', null, 'en')).toBe('Silomis: Your order ORD-1 has been cancelled.');
    expect(renderCustomerSms('order_message', 'ORD-1', null, 'en')).toBe('Silomis: We have replied to your message about order ORD-1.');
  });

  it('falls back to French for a locale the shop does not have', () => {
    expect(renderCustomerSms('access_link', 'ORD-1', 'u', 'ja')).toContain('Votre lien de suivi');
  });
});

describe('abandoned-cart SMS', () => {
  it('is sent with the resume link and the STOP line', async () => {
    const { service, sms } = makeService();
    await service.sendAbandonedCart('+33612345678', 'https://x.test/r', 'en', 'cart-1');
    expect(sms.addMessage).toHaveBeenCalledWith('+33612345678', 'Silomis: Your basket is waiting! Complete your order here:\nhttps://x.test/r\nReply STOP to opt out');
  });

  it('is never sent to a number that replied STOP', async () => {
    const { service, sms, prisma } = makeService(undefined, true);
    await service.sendAbandonedCart('+33612345678', 'https://x.test/r', 'fr', 'cart-1');
    expect(sms.addMessage).not.toHaveBeenCalled();
    expect(prisma.commerceNotificationLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'customer_cart_abandoned', status: 'skipped' }) });
  });

  it('respects the customer-SMS switch', async () => {
    const { service, sms } = makeService('false');
    await service.sendAbandonedCart('+33612345678', 'https://x.test/r', 'fr', 'cart-1');
    expect(sms.addMessage).not.toHaveBeenCalled();
  });

  it('renders in French by default', () => {
    expect(renderAbandonedCartSms('u', null)).toContain('STOP pour ne plus recevoir');
  });
});

describe('isStopReply', () => {
  it.each(['STOP', ' stop ', 'Stop.', 'ARRET', 'arrêt', 'Stopp'])('treats %p as an opt-out', (t) => expect(isStopReply(t)).toBe(true));
  it.each(['please do not stop', 'stop sending me the reminder please', 'merci', ''])('does not treat %p as one', (t) => expect(isStopReply(t)).toBe(false));
});
