import { HttpException } from '@nestjs/common';
import { SmsService } from './sms.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Minimal Prisma stand-in. `create` echoes the row back so a test can assert
 * what the service decided to store, which is where all the logic lives.
 */
function prismaStub(overrides: Record<string, unknown> = {}) {
  return {
    smsMessage: {
      create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 1, ...(data as object) })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides,
    },
  } as unknown as PrismaService;
}

/** What the service stored, for the single-create tests. */
async function stored(service: SmsService, to: string, message: string) {
  const row = (await service.addMessage(to, message)) as unknown as { to: string; message: string };
  return row;
}

describe('SmsService', () => {
  describe('addMessage', () => {
    it('rejects an empty recipient or body', async () => {
      const service = new SmsService(prismaStub());
      await expect(service.addMessage('', 'hi')).rejects.toBeInstanceOf(HttpException);
      await expect(service.addMessage('+33600000000', '')).rejects.toBeInstanceOf(HttpException);
    });

    it('normalizes the number: strips spaces and turns a 00 prefix into +', async () => {
      const service = new SmsService(prismaStub());
      await expect(stored(service, '00 33 6 12 34 56 78', 'hi')).resolves.toMatchObject({ to: '+33612345678' });
      await expect(stored(service, '+33 6 12 34 56 78', 'hi')).resolves.toMatchObject({ to: '+33612345678' });
    });

    it('defaults to an outbound message', async () => {
      const service = new SmsService(prismaStub());
      await expect(service.addMessage('+33600000000', 'hi')).resolves.toMatchObject({ type: 'outbound' });
    });
  });

  /**
   * One character outside GSM-7 flips the whole message to UCS-2 and cuts the
   * segment from 160 characters to 70, so these substitutions decide what an
   * SMS costs. The curly-quote cases are regressions: the original character
   * classes held two ASCII quotes rather than the curly pair, so they replaced
   * those characters with themselves and did nothing at all.
   */
  describe('GSM-7 sanitising', () => {
    const sanitised = async (text: string) => (await stored(new SmsService(prismaStub()), '+33600000000', text)).message;

    it('replaces curly single quotes, which the old class missed entirely', async () => {
      await expect(sanitised('L’article ‘test’')).resolves.toBe("L'article 'test'");
    });

    it('replaces curly double quotes', async () => {
      await expect(sanitised('“série”')).resolves.toBe('"série"');
    });

    it('replaces the euro sign, dashes, ellipsis and non-breaking spaces', async () => {
      await expect(sanitised('12€ — ok…')).resolves.toBe('12EUR - ok...');
      await expect(sanitised('a b c')).resolves.toBe('a b c');
    });

    it('leaves accented letters alone — they are copy, not punctuation', async () => {
      await expect(sanitised('Casquette brodée d’été')).resolves.toBe("Casquette brodée d'été");
    });

    it('leaves a message that is already plain ASCII untouched', async () => {
      await expect(sanitised('Your verification code is: 123456.')).resolves.toBe('Your verification code is: 123456.');
    });
  });

  describe('getConsumedStatuses', () => {
    it('treats an id the pruner already deleted as consumed', async () => {
      const prisma = prismaStub({
        findMany: jest.fn().mockResolvedValue([{ id: 1, consumed: false }]),
      });
      const service = new SmsService(prisma);

      const result = await service.getConsumedStatuses([1, 2]);

      expect(result.get(1)).toBe(false);
      // Never stored (or pruned after delivery) — the gateway must not wait on it.
      expect(result.get(2)).toBe(true);
    });

    it('does not query at all for an empty id list', async () => {
      const prisma = prismaStub();
      const service = new SmsService(prisma);

      await expect(service.getConsumedStatuses([])).resolves.toEqual(new Map());
      expect((prisma as unknown as { smsMessage: { findMany: jest.Mock } }).smsMessage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('ack', () => {
    it('reports failure for an unknown id', async () => {
      const service = new SmsService(prismaStub());
      await expect(service.ack(99)).resolves.toEqual({ ok: false });
    });

    it('is idempotent — acking an already-consumed message writes nothing', async () => {
      const prisma = prismaStub({
        findUnique: jest.fn().mockResolvedValue({ id: 1, consumed: true }),
      });
      const service = new SmsService(prisma);

      await expect(service.ack(1)).resolves.toEqual({ ok: true });
      expect((prisma as unknown as { smsMessage: { update: jest.Mock } }).smsMessage.update).not.toHaveBeenCalled();
    });
  });

  describe('pollNext', () => {
    it('reports empty rather than throwing when the queue is drained', async () => {
      const service = new SmsService(prismaStub());
      await expect(service.pollNext('outbound')).resolves.toEqual({ error: 'empty' });
    });

    it('marks the message consumed before handing it to the gateway', async () => {
      const prisma = prismaStub({
        findFirst: jest.fn().mockResolvedValue({ id: 7, to: '+33600000000', message: 'hi', type: 'outbound', consumed: false }),
      });
      const service = new SmsService(prisma);

      await expect(service.pollNext('outbound')).resolves.toMatchObject({ id: 7, consumed: true });
      expect((prisma as unknown as { smsMessage: { update: jest.Mock } }).smsMessage.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { consumed: true },
      });
    });
  });
});
