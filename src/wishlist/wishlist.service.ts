import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  list(sessionToken: string | null, userId: string | null) {
    if (userId) return this.prisma.wishlistItem.findMany({ where: { userId }, orderBy: { addedAt: 'desc' } });
    if (sessionToken) return this.prisma.wishlistItem.findMany({ where: { sessionToken }, orderBy: { addedAt: 'desc' } });
    return Promise.resolve([]);
  }

  /** Idempotent — returns the existing row if this product is already wishlisted under the same owner. */
  async add(sessionToken: string | null, userId: string | null, productId: string, variantId?: string | null) {
    const where = userId ? { userId_productId: { userId, productId } } : { sessionToken_productId: { sessionToken: sessionToken!, productId } };
    const existing = await this.prisma.wishlistItem.findUnique({ where });
    if (existing) return existing;

    return this.prisma.wishlistItem.create({
      data: { sessionToken: userId ? null : sessionToken, userId, productId, variantId: variantId ?? null },
    });
  }

  async remove(sessionToken: string | null, userId: string | null, productId: string): Promise<void> {
    const where = userId ? { userId, productId } : { sessionToken: sessionToken ?? '', productId };
    await this.prisma.wishlistItem.deleteMany({ where });
  }

  isWishlisted(sessionToken: string | null, userId: string | null, productId: string): Promise<boolean> {
    const where = userId ? { userId_productId: { userId, productId } } : { sessionToken_productId: { sessionToken: sessionToken ?? '', productId } };
    return this.prisma.wishlistItem.findUnique({ where }).then((r) => !!r);
  }

  /**
   * Guest -> account reconciliation on login: a guest duplicate of an item the
   * account already owns is silently discarded (the account's row wins, no
   * merge-conflict resolution). Wrapped in a transaction so a failure partway
   * through never leaves guest rows half-migrated.
   */
  async mergeGuestToUser(sessionToken: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const guestItems = await tx.wishlistItem.findMany({ where: { sessionToken } });
      for (const item of guestItems) {
        const existing = await tx.wishlistItem.findUnique({ where: { userId_productId: { userId, productId: item.productId } } });
        if (!existing) {
          await tx.wishlistItem.create({ data: { sessionToken: null, userId, productId: item.productId, variantId: item.variantId } });
        }
      }
      await tx.wishlistItem.deleteMany({ where: { sessionToken } });
    });
  }

  // ── Admin analytics ──────────────────────────────────────────────────────

  async getMostWishlisted(limit = 20) {
    const grouped = await this.prisma.wishlistItem.groupBy({ by: ['productId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: limit });
    const products = await this.prisma.product.findMany({ where: { id: { in: grouped.map((g) => g.productId) } }, select: { id: true, title: true, slug: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    return grouped.map((g) => ({ productId: g.productId, count: g._count.id, product: byId.get(g.productId) ?? null }));
  }

  /** Wishlisted (by a known account) but never purchased by that same customer — guest rows are excluded, there's no reliable link to a completed order. */
  async getNonConvertingWishlist(limit = 20) {
    const recent = await this.prisma.wishlistItem.findMany({ where: { userId: { not: null } }, orderBy: { addedAt: 'desc' }, take: 500 });
    if (!recent.length) return [];

    const userIds = [...new Set(recent.map((r) => r.userId!))];
    const paidOrders = await this.prisma.order.findMany({
      where: { userId: { in: userIds }, status: { in: ['paid', 'processing', 'shipped', 'delivered'] } },
      include: { items: { select: { productId: true } } },
    });
    const purchased = new Set(paidOrders.flatMap((o) => o.items.map((i) => `${o.userId}:${i.productId}`)));

    const nonConverting = recent.filter((r) => !purchased.has(`${r.userId}:${r.productId}`)).slice(0, limit);
    const products = await this.prisma.product.findMany({ where: { id: { in: nonConverting.map((r) => r.productId) } }, select: { id: true, title: true, slug: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    return nonConverting.map((r) => ({ ...r, product: byId.get(r.productId) ?? null }));
  }
}
