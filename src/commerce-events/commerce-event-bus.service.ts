import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceEventName } from './commerce-events.constants';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CommerceEventBus {
  private readonly logger = new Logger(CommerceEventBus.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  emit(eventName: CommerceEventName, payload: Record<string, unknown>, opts: { entityId?: string; source?: string } = {}): void {
    // Persist audit log entry asynchronously — never block the calling transaction.
    setImmediate(async () => {
      try {
        await this.prisma.commerceEventLog.create({
          data: {
            eventName,
            entityId: opts.entityId ?? null,
            payload: payload as Prisma.InputJsonValue,
            source: opts.source ?? null,
            status: 'success',
          },
        });
      } catch (err) {
        this.logger.warn(`Event log write failed for ${eventName}: ${(err as Error).message}`);
      }
    });

    this.emitter.emit(eventName, payload);
  }

  async queryLog(opts: { eventName?: string; entityId?: string; status?: string; limit?: number; offset?: number } = {}) {
    const { eventName, entityId, status, limit = 50, offset = 0 } = opts;
    const where = {
      ...(eventName ? { eventName } : {}),
      ...(entityId ? { entityId } : {}),
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.commerceEventLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.commerceEventLog.count({ where }),
    ]);
    return { items, total };
  }
}
