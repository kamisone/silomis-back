import { BadRequestException } from '@nestjs/common';
import { MfaMethod } from '../../generated/prisma/client';
import { MfaService } from './mfa.service';

/**
 * Which destination a code actually goes to.
 *
 * `preferredMfaMethod` is a *preference*, not a promise: SMS needs a phone
 * number, and an admin's profile may not have one — either because it was never
 * filled in, or because it was cleared after the preference was set. Both send
 * paths have to narrow it the same way, because the one that does not sends
 * nothing at all: `sendOtp` writes the OTP to Redis and spends the rate-limit
 * budget before it reaches the transport, so a throw there leaves a live code
 * prompt with no code on its way to anybody. That is a lock-out, and it only
 * shows up on the account that is already the hardest to get back into.
 */
describe('MfaService method resolution', () => {
  const EMAIL = 'ops@silomis.com';
  const PHONE = '+33612345678';

  function build(admin: { phone: string | null; preferredMfaMethod: MfaMethod }) {
    const sent: Array<{ method: MfaMethod; to: string }> = [];

    const store = new Map<string, string>();
    const redis = {
      client: {
        incr: jest.fn(async (k: string) => {
          const n = Number(store.get(k) ?? 0) + 1;
          store.set(k, String(n));
          return n;
        }),
        expire: jest.fn(async () => 1),
        set: jest.fn(async () => 'OK'),
        get: jest.fn(async () => null),
        del: jest.fn(async () => 1),
      },
    };

    const service = new MfaService(
      { findById: jest.fn(async () => ({ id: 'a1', email: EMAIL, ...admin })) } as never,
      {
        sign: jest.fn(() => 'challenge.token'),
        verify: jest.fn(() => ({ sub: 'a1', email: EMAIL, jti: 'j1', type: 'mfa-challenge' })),
      } as never,
      redis as never,
      {
        sendEmail: jest.fn(async (to: string) => {
          sent.push({ method: 'email', to });
        }),
        // Mirrors the real transport: no number, nothing to send to. Without
        // this the `admin.phone!` non-null assertion in sendOtp would quietly
        // pass `null` through a mock and the bug would look fixed.
        sendSms: jest.fn(async (to: string) => {
          if (!to) throw new Error('sendSms called without a destination');
          sent.push({ method: 'sms', to });
        }),
      } as never,
    );

    return { service, sent };
  }

  describe('with a phone on file', () => {
    it('honours an SMS preference and offers both methods', async () => {
      const { service, sent } = build({ phone: PHONE, preferredMfaMethod: 'sms' });

      const res = await service.initChallenge('a1', EMAIL, 'sms');

      expect(res.availableMethods).toEqual(['email', 'sms']);
      expect(res.preferredMethod).toBe('sms');
      expect(res.maskedDestination).toBe('*******5678');
      expect(sent).toEqual([{ method: 'sms', to: PHONE }]);
    });

    it('lets the sign-in page ask for the other method explicitly', async () => {
      const { service, sent } = build({ phone: PHONE, preferredMfaMethod: 'sms' });

      const res = await service.resend('challenge.token', 'email');

      expect(res.maskedDestination).toBe('op***@silomis.com');
      expect(sent).toEqual([{ method: 'email', to: EMAIL }]);
    });
  });

  describe('with an SMS preference but no phone on file', () => {
    const admin = { phone: null, preferredMfaMethod: 'sms' as MfaMethod };

    it('falls back to email on the first send', async () => {
      const { service, sent } = build(admin);

      const res = await service.initChallenge('a1', EMAIL, 'sms');

      expect(res.availableMethods).toEqual(['email']);
      expect(res.preferredMethod).toBe('email');
      expect(sent).toEqual([{ method: 'email', to: EMAIL }]);
    });

    // The regression this file exists for. `resend` used to take
    // `preferredMfaMethod` at face value, so "Send a new code" went down the
    // SMS path with no number — after the OTP had already been stored.
    it('falls back to email on a resend too', async () => {
      const { service, sent } = build(admin);

      const res = await service.resend('challenge.token');

      expect(res.maskedDestination).toBe('op***@silomis.com');
      expect(sent).toEqual([{ method: 'email', to: EMAIL }]);
    });

    it('still rejects an explicit ask for SMS', async () => {
      const { service, sent } = build(admin);

      await expect(service.resend('challenge.token', 'sms')).rejects.toThrow(BadRequestException);
      expect(sent).toEqual([]);
    });
  });
});
