import { HttpException } from '@nestjs/common';
import { PhoneVerificationService } from './phone-verification.service';

/** An in-memory stand-in for the handful of Redis calls the service makes. */
function fakeRedis() {
  const store = new Map<string, string>();
  const client = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => keys.forEach((k) => store.delete(k))),
    incr: jest.fn(async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    }),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => 300),
  };
  return { client, store };
}

const CART = '11111111-1111-4111-8111-111111111111';

function makeService(opts: { enabled?: boolean } = {}) {
  const redis = fakeRedis();
  const prisma = {
    platformSettings: { findUnique: jest.fn().mockResolvedValue(opts.enabled ? { value: 'true' } : null) },
    country: { findUnique: jest.fn().mockResolvedValue({ phonePrefix: '+33' }) },
  };
  const sms = { sendVerificationCode: jest.fn().mockResolvedValue(undefined) };
  const service = new PhoneVerificationService(prisma as never, redis as never, sms as never);
  const sentCode = () => sms.sendVerificationCode.mock.calls.at(-1)?.[1] as string;
  return { service, sms, redis, sentCode };
}

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return ((err as HttpException).getResponse() as { code?: string }).code;
  }
}

describe('PhoneVerificationService', () => {
  it('is required only when switched on and the phone is the only contact', async () => {
    expect(await makeService({ enabled: true }).service.isRequired({ email: null, phone: '+33612345678' })).toBe(true);
    expect(await makeService({ enabled: true }).service.isRequired({ email: 'a@b.fr', phone: '+33612345678' })).toBe(false);
    expect(await makeService({ enabled: false }).service.isRequired({ email: null, phone: '+33612345678' })).toBe(false);
  });

  it('texts a 6-digit code to the E.164 number and masks it in the answer', async () => {
    const { service, sms, sentCode } = makeService();
    const res = await service.sendCode(CART, '06 12 34 56 78', 'FR', 'fr');
    expect(sms.sendVerificationCode).toHaveBeenCalledWith('+33612345678', expect.stringMatching(/^\d{6}$/), 'fr');
    expect(sentCode()).toHaveLength(6);
    expect(res.maskedPhone).toBe('+33 •••• 78');
  });

  it('confirms the right code, however the number is retyped', async () => {
    const { service, sentCode } = makeService();
    await service.sendCode(CART, '06 12 34 56 78', 'FR', 'fr');
    await expect(service.verify(CART, '+33 6 12 34 56 78', 'FR', sentCode())).resolves.toEqual({ verified: true });
    expect(await service.isVerified(CART, '+33612345678')).toBe(true);
  });

  it('refuses a wrong code, then locks after five tries', async () => {
    const { service, sentCode } = makeService();
    await service.sendCode(CART, '0612345678', 'FR', 'fr');
    const wrong = sentCode() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect(await errorCode(service.verify(CART, '0612345678', 'FR', wrong))).toBe('INVALID_CODE');
    expect(await errorCode(service.verify(CART, '0612345678', 'FR', wrong))).toBe('TOO_MANY_ATTEMPTS');
    // The code is gone: even the right one no longer works.
    expect(await errorCode(service.verify(CART, '0612345678', 'FR', sentCode()))).toBe('CODE_EXPIRED');
  });

  it('does not accept a code sent to a different number', async () => {
    const { service, sentCode } = makeService();
    await service.sendCode(CART, '0612345678', 'FR', 'fr');
    expect(await errorCode(service.verify(CART, '0699999999', 'FR', sentCode()))).toBe('CODE_EXPIRED');
  });

  it('makes a second send wait', async () => {
    const { service } = makeService();
    await service.sendCode(CART, '0612345678', 'FR', 'fr');
    expect(await errorCode(service.sendCode(CART, '0612345678', 'FR', 'fr'))).toBe('RESEND_TOO_SOON');
  });

  it('rejects a number that cannot be placed', async () => {
    const { service } = makeService();
    expect(await errorCode(service.sendCode(CART, 'not a phone', 'FR', 'fr'))).toBe('INVALID_PHONE');
  });

  it('clears the cooldown when the gateway outbox refuses the text, so the customer can retry', async () => {
    const { service, sms } = makeService();
    sms.sendVerificationCode.mockRejectedValueOnce(new Error('db down'));
    await expect(service.sendCode(CART, '0612345678', 'FR', 'fr')).rejects.toBeInstanceOf(HttpException);
    await expect(service.sendCode(CART, '0612345678', 'FR', 'fr')).resolves.toMatchObject({ maskedPhone: '+33 •••• 78' });
  });
});
