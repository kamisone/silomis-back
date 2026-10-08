import { CartAbandonmentProcessor } from './cart-abandonment.processor';

const CART = 'cart-1';

function make(opts: { snapshot?: Record<string, unknown> | null; order?: Record<string, unknown> | null }) {
  const prisma = {
    cart: {
      findFirst: jest.fn().mockResolvedValue({ id: 'c1', items: [{ titleSnapshot: 'Cap', quantity: 1, unitPriceCents: 2000 }] }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: { findFirst: jest.fn().mockResolvedValue(opts.order ?? null) },
    country: { findUnique: jest.fn().mockResolvedValue({ phonePrefix: '+33' }) },
  };
  const sessions = {
    findByCartToken: jest.fn().mockResolvedValue(
      opts.snapshot === undefined ? null : { completedAt: null, resumeToken: 'r1', locale: 'fr', formSnapshot: opts.snapshot },
    ),
  };
  const email = { sendAbandonedCart: jest.fn().mockResolvedValue(undefined) };
  const sms = { sendAbandonedCart: jest.fn().mockResolvedValue(undefined) };
  const bus = { emit: jest.fn() };
  const processor = new CartAbandonmentProcessor({} as never, prisma as never, email as never, sessions as never, bus as never, sms as never);
  return { processor, email, sms };
}

const job = { data: { cartToken: CART } } as never;

describe('CartAbandonmentProcessor — SMS reminder', () => {
  beforeAll(() => {
    process.env.APP_URL = 'https://shop.test';
  });

  it('texts the phone from the checkout form when the customer ticked the box', async () => {
    const { processor, sms, email } = make({ snapshot: { email: '', phone: '06 12 34 56 78', country: 'FR', smsOptIn: true } });
    await processor.process(job);
    expect(sms.sendAbandonedCart).toHaveBeenCalledWith('+33612345678', 'https://shop.test/shop/checkout/resume/r1', 'fr', CART);
    expect(email.sendAbandonedCart).not.toHaveBeenCalled();
  });

  it('sends nothing by SMS without the tick', async () => {
    const { processor, sms } = make({ snapshot: { email: 'a@b.fr', phone: '06 12 34 56 78', country: 'FR', smsOptIn: false } });
    await processor.process(job);
    expect(sms.sendAbandonedCart).not.toHaveBeenCalled();
  });

  it('sends both when there is an email and a ticked phone', async () => {
    const { processor, sms, email } = make({ snapshot: { email: 'a@b.fr', phone: '+33612345678', country: 'FR', smsOptIn: true } });
    await processor.process(job);
    expect(sms.sendAbandonedCart).toHaveBeenCalled();
    expect(email.sendAbandonedCart).toHaveBeenCalledWith('a@b.fr', expect.anything());
  });

  it('falls back to the draft order, and its consent, when there is no session', async () => {
    const { processor, sms } = make({ order: { customerEmail: null, customerPhone: '+33612345678', smsMarketingOptIn: true, customerLocale: 'en', customerName: null } });
    await processor.process(job);
    expect(sms.sendAbandonedCart).toHaveBeenCalledWith('+33612345678', 'https://shop.test/shop/cart/resume/cart-1', 'en', CART);
  });

  it('does not text a draft order without consent', async () => {
    const { processor, sms } = make({ order: { customerEmail: null, customerPhone: '+33612345678', smsMarketingOptIn: false, customerLocale: 'en' } });
    await processor.process(job);
    expect(sms.sendAbandonedCart).not.toHaveBeenCalled();
  });
});
