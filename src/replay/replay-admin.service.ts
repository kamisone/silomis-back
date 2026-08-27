import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GcsService } from '../gcs/gcs.service';
import { ReplaySessionStatus } from '../../generated/prisma/client';
import { DateWindow } from '../analytics/analytics-filters';

@Injectable()
export class ReplayAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
  ) {}

  /**
   * Unread-session count per product, for the "▶ Replays" badge on the
   * test-products table. A real GROUP BY COUNT rather than list()'s
   * fetch-then-filter approach, so a product with more sessions than the
   * list's page size still counts correctly.
   */
  async getUnreadCounts(productIds: string[], window: DateWindow): Promise<Record<string, number>> {
    if (!productIds.length) return {};
    const rows = await this.prisma.replaySession.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, viewedAt: null, startedAt: { gte: window.since, lt: window.until } },
      _count: { id: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) if (r.productId) counts[r.productId] = r._count.id;
    return counts;
  }

  /**
   * Sessions for the replay list — newest first, scoped to the same date
   * window the test-products table and the unread badge use, so a badge
   * count and the list it opens can never disagree.
   */
  async list(window: DateWindow, filter: { productId?: string; status?: ReplaySessionStatus; limit?: number; offset?: number } = {}) {
    const { productId, status, limit = 20, offset = 0 } = filter;
    const where = {
      startedAt: { gte: window.since, lt: window.until },
      ...(productId ? { productId } : {}),
      ...(status ? { status } : {}),
    };
    const [sessions, total] = await Promise.all([this.prisma.replaySession.findMany({ where, orderBy: { startedAt: 'desc' }, take: limit, skip: offset }), this.prisma.replaySession.count({ where })]);
    const items = await this.withProduct(sessions);
    return { items, total };
  }

  async findOne(id: string) {
    const raw = await this.prisma.replaySession.findUnique({ where: { id } });
    if (!raw) throw new NotFoundException('Replay session not found');

    if (!raw.viewedAt) await this.prisma.replaySession.update({ where: { id }, data: { viewedAt: new Date() } });

    const [[session], markers] = await Promise.all([this.withProduct([raw]), this.prisma.replayEvent.findMany({ where: { sessionId: id }, orderBy: { timestampMs: 'asc' } })]);
    return { session, markers };
  }

  private async withProduct<T extends { productId: string | null }>(sessions: T[]): Promise<Array<T & { product: { id: string; title: string } | null }>> {
    const productIds = [...new Set(sessions.map((s) => s.productId).filter((id): id is string => !!id))];
    const products = productIds.length ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true } }) : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return sessions.map((s) => ({ ...s, product: s.productId ? (byId.get(s.productId) ?? null) : null }));
  }

  /** Downloads and concatenates every chunk in sequence order — playback works entirely server-proxied, no signed URLs. */
  async getSessionEvents(id: string): Promise<unknown[]> {
    const chunks = await this.prisma.replaySessionChunk.findMany({ where: { sessionId: id }, orderBy: { sequence: 'asc' } });
    const events: unknown[] = [];
    for (const chunk of chunks) {
      try {
        const buf = await this.gcs.downloadBuffer(chunk.gcsObjectKey);
        const parsed = JSON.parse(buf.toString('utf-8'));
        if (Array.isArray(parsed)) events.push(...parsed);
      } catch {
        // A missing/corrupt chunk shouldn't fail the whole playback — skip it.
      }
    }
    return events;
  }
}
