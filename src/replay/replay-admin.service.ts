import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GcsService } from '../gcs/gcs.service';
import { BehaviorEventType, OrderStatus, ReplaySessionStatus } from '../../generated/prisma/client';
import { DateWindow } from '../analytics/analytics-filters';

/** Behaviour events this long before a session's start still belong to it — the product_view fires as the page mounts, a beat before the recorder's session round trip lands. */
const ACTIVITY_LEAD_MS = 60_000;
/**
 * …and this long after its last recorded frame. Checkout is server-side work
 * (checkout_started is written when the order is created, test_checkout_blocked
 * when payment is refused), so it can land after the recorder's last batch.
 */
const ACTIVITY_TRAIL_MS = 30 * 60_000;

/** One step of what the visitor did during a session, collapsed by type: a product page viewed three times is one "Product view ×3". */
export interface SessionActivity {
  type: BehaviorEventType;
  count: number;
  firstAt: Date;
}

export interface SessionOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: Date;
}

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
  async getUnreadCounts(productIds: string[], window: DateWindow, scope?: 'test' | 'live'): Promise<Record<string, number>> {
    if (!productIds.length) return {};
    const rows = await this.prisma.replaySession.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        // Scoped to the phase the session was recorded in, so a promoted
        // product's test-phase recordings stay behind the test tab's badge
        // rather than following it into the live one.
        ...(scope ? { productIsTest: scope === 'test' } : {}),
        viewedAt: null,
        startedAt: { gte: window.since, lt: window.until },
      },
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
  async list(window: DateWindow, filter: { productId?: string; status?: ReplaySessionStatus; scope?: 'test' | 'live'; limit?: number; offset?: number } = {}) {
    const { productId, status, scope, limit = 20, offset = 0 } = filter;
    const where = {
      startedAt: { gte: window.since, lt: window.until },
      ...(productId ? { productId } : {}),
      ...(status ? { status } : {}),
      ...(scope ? { productIsTest: scope === 'test' } : {}),
    };
    const [sessions, total] = await Promise.all([this.prisma.replaySession.findMany({ where, orderBy: { startedAt: 'desc' }, take: limit, skip: offset }), this.prisma.replaySession.count({ where })]);
    const items = await this.withActivity(await this.withProduct(sessions));
    return { items, total };
  }

  async findOne(id: string) {
    const raw = await this.prisma.replaySession.findUnique({ where: { id } });
    if (!raw) throw new NotFoundException('Replay session not found');

    if (!raw.viewedAt) await this.prisma.replaySession.update({ where: { id }, data: { viewedAt: new Date() } });

    const [[session], markers] = await Promise.all([this.withProduct([raw]), this.prisma.replayEvent.findMany({ where: { sessionId: id }, orderBy: { timestampMs: 'asc' } })]);
    return { session, markers };
  }

  /**
   * Marks a session viewed without loading its recording.
   *
   * Opening a session already does this as a side effect of findOne, but a lot
   * of sessions are identifiable as uninteresting from the list row alone — a
   * two-second bounce with no clicks — and clearing the unread badge should not
   * require downloading and playing them.
   *
   * Idempotent: an already-viewed session keeps its original timestamp, so the
   * moment it was first looked at is not rewritten by a second click.
   */
  async markViewed(id: string): Promise<{ viewedAt: Date }> {
    const session = await this.prisma.replaySession.findUnique({ where: { id }, select: { viewedAt: true } });
    if (!session) throw new NotFoundException('Replay session not found');
    if (session.viewedAt) return { viewedAt: session.viewedAt };

    const updated = await this.prisma.replaySession.update({ where: { id }, data: { viewedAt: new Date() } });
    return { viewedAt: updated.viewedAt! };
  }

  /**
   * What each session's visitor did (product views, add to cart, reached
   * shipping/checkout…) and any order their cart produced, whatever its
   * status — draft and cancelled included.
   *
   * Behaviour events are tied to a session by its cart token, falling back to
   * the visitor hash for events written without one (and older product views,
   * which were not sent with a token). An event carrying a *different* cart
   * token is another browser behind the same address and is left out.
   * Scoped to the session's product (plus product-less events like searches)
   * and to the session's own time span, so a later visit by the same visitor
   * does not leak into this row.
   */
  private async withActivity<T extends { productId: string | null; cartToken: string | null; visitorHash: string | null; startedAt: Date; endedAt: Date | null; lastEventAt: Date }>(
    sessions: T[],
  ): Promise<Array<T & { activity: SessionActivity[]; orders: SessionOrder[] }>> {
    if (!sessions.length) return [];

    const span = (s: T) => ({
      from: new Date(s.startedAt.getTime() - ACTIVITY_LEAD_MS),
      to: new Date(Math.max(s.lastEventAt.getTime(), s.endedAt?.getTime() ?? 0) + ACTIVITY_TRAIL_MS),
    });
    const spans = sessions.map(span);
    const from = new Date(Math.min(...spans.map((x) => x.from.getTime())));
    const to = new Date(Math.max(...spans.map((x) => x.to.getTime())));
    const tokens = [...new Set(sessions.map((s) => s.cartToken).filter((t): t is string => !!t))];
    const hashes = [...new Set(sessions.map((s) => s.visitorHash).filter((h): h is string => !!h))];
    const productIds = [...new Set(sessions.map((s) => s.productId).filter((id): id is string => !!id))];

    const visitorConds = [...(tokens.length ? [{ cartToken: { in: tokens } }] : []), ...(hashes.length ? [{ visitorHash: { in: hashes } }] : [])];
    const [events, orders] = await Promise.all([
      visitorConds.length
        ? this.prisma.shopBehaviorEvent.findMany({
            where: {
              createdAt: { gte: from, lt: to },
              OR: visitorConds,
              AND: [{ OR: [{ productId: null }, ...(productIds.length ? [{ productId: { in: productIds } }] : [])] }],
            },
            select: { eventType: true, cartToken: true, visitorHash: true, productId: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      tokens.length
        ? this.prisma.order.findMany({
            where: { cartToken: { in: tokens } },
            select: { id: true, orderNumber: true, status: true, cartToken: true, createdAt: true, updatedAt: true },
            orderBy: { createdAt: 'asc' },
          })
        : [],
    ]);

    return sessions.map((s, i) => {
      const { from: sFrom, to: sTo } = spans[i];
      const inSpan = (d: Date) => d >= sFrom && d < sTo;

      const byType = new Map<BehaviorEventType, SessionActivity>();
      for (const e of events) {
        if (!inSpan(e.createdAt)) continue;
        if (e.productId && e.productId !== s.productId) continue;
        const sameVisitor = e.cartToken && s.cartToken ? e.cartToken === s.cartToken : !!e.visitorHash && e.visitorHash === s.visitorHash;
        if (!sameVisitor) continue;
        const entry = byType.get(e.eventType);
        if (entry) entry.count++;
        else byType.set(e.eventType, { type: e.eventType, count: 1, firstAt: e.createdAt });
      }

      // An order is resumed rather than recreated while its cart is still
      // active (CheckoutService idempotency), so one created before this
      // session can still be the one it touched — updatedAt catches that.
      const sessionOrders = orders
        .filter((o) => o.cartToken === s.cartToken && (inSpan(o.createdAt) || inSpan(o.updatedAt)))
        .map(({ id, orderNumber, status, createdAt }) => ({ id, orderNumber, status, createdAt }));

      return { ...s, activity: [...byType.values()], orders: sessionOrders };
    });
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
