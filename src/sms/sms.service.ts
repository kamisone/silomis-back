import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsMessage, SmsType } from '../../generated/prisma/client';

@Injectable()
export class SmsService {
  constructor(private readonly prisma: PrismaService) {}

  async pollNext(type: SmsType = 'outbound', to?: string): Promise<SmsMessage | { error: string }> {
    const sms = await this.prisma.smsMessage.findFirst({
      where: { type, consumed: false, ...(to ? { to } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (!sms) return { error: 'empty' };
    await this.prisma.smsMessage.update({ where: { id: sms.id }, data: { consumed: true } });
    await this.pruneConsumedForNumber(sms.to);
    return { ...sms, consumed: true };
  }

  private async pruneConsumedForNumber(to: string): Promise<void> {
    const keepIds: number[] = [];

    for (const type of ['outbound', 'inbound'] as SmsType[]) {
      const last = await this.prisma.smsMessage.findFirst({
        where: { consumed: true, type, to },
        orderBy: { createdAt: 'desc' },
      });
      if (last) keepIds.push(last.id);
    }

    await this.prisma.smsMessage.deleteMany({
      where: { consumed: true, to, id: { notIn: keepIds } },
    });
  }

  async getLastConsumed(to: string): Promise<{ inbound: SmsMessage | null; outbound: SmsMessage | null }> {
    const unconsumed = await this.prisma.smsMessage.findMany({
      where: { type: 'inbound', consumed: false, ...(to ? { to } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (unconsumed.length > 0) {
      await this.prisma.smsMessage.updateMany({
        where: { id: { in: unconsumed.map((s) => s.id) } },
        data: { consumed: true },
      });
      await this.pruneConsumedForNumber(to);
    }

    const where = (type: SmsType) => ({ consumed: true, type, ...(to ? { to } : {}) });

    const [inbound, outbound] = await Promise.all([
      this.prisma.smsMessage.findFirst({ where: where('inbound'), orderBy: { createdAt: 'desc' } }),
      this.prisma.smsMessage.findFirst({ where: where('outbound'), orderBy: { createdAt: 'desc' } }),
    ]);

    return { inbound: inbound ?? null, outbound: outbound ?? null };
  }

  async pollAll(): Promise<SmsMessage[]> {
    return this.prisma.smsMessage.findMany();
  }

  /** Returns the `consumed` flag for each requested message id.
   *  Ids absent from the DB were pruned after delivery and are treated as consumed. */
  async getConsumedStatuses(ids: number[]): Promise<Map<number, boolean>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.smsMessage.findMany({
      where: { id: { in: ids } },
      select: { id: true, consumed: true },
    });
    const result = new Map(rows.map((r) => [r.id, r.consumed]));
    for (const id of ids) {
      if (!result.has(id)) result.set(id, true);
    }
    return result;
  }

  async ack(id: number): Promise<{ ok: boolean }> {
    const sms = await this.prisma.smsMessage.findUnique({ where: { id } });
    if (!sms) return { ok: false };
    if (!sms.consumed) {
      await this.prisma.smsMessage.update({ where: { id }, data: { consumed: true } });
    }
    return { ok: true };
  }

  async addMessage(to: string, message: string, type: SmsType = 'outbound'): Promise<SmsMessage> {
    if (!to || !message) {
      throw new HttpException('body params invalid', 400);
    }
    const normalized = this.normalizePhone(to);
    const sanitized = this.sanitizeForGsm(message);
    return this.prisma.smsMessage.create({ data: { to: normalized, message: sanitized, type } });
  }

  private normalizePhone(raw: string): string {
    return raw.replace(/\s+/g, '').replace(/^00/, '+');
  }

  /**
   * Keeps a message inside the GSM-7 alphabet. One character outside it flips
   * the whole SMS to UCS-2, which cuts a segment from 160 characters to 70 —
   * so a stray curly apostrophe in a product title silently doubles the cost
   * and can truncate the message.
   *
   * Written with explicit code-point escapes on purpose. The previous version
   * read `/['']/g` and `/[""]/g`, which look like curly-quote classes but are
   * two plain ASCII characters each — every one of those replacements was a
   * no-op, and the quotes it existed to catch went through untouched. A curly
   * quote is indistinguishable from a straight one in source, which is exactly
   * how that survived. (vitecamio carries the same bug.)
   */
  private sanitizeForGsm(text: string): string {
    return (
      text
        .replace(/\u20AC/g, 'EUR')
        // em dash, en dash, horizontal bar
        .replace(/[\u2014\u2013\u2015]/g, '-')
        // ' ' ‚ ‛ and the prime often pasted in for a foot mark
        .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
        // " " „ ‟ and double prime
        .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
        .replace(/\u2026/g, '...')
        // non-breaking, narrow no-break and thin spaces — common in French copy
        .replace(/[\u00A0\u202F\u2009]/g, ' ')
        .replace(/[\u2022\u00B7]/g, '-')
    );
  }
}
