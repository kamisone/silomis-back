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

  private sanitizeForGsm(text: string): string {
    return text
      .replace(/€/g, 'EUR')
      .replace(/[—–]/g, '-')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }
}
