import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma } from '../../generated/prisma/client';

/** Statuses that represent a completed sale (payment captured) — same set used by OrdersService's REVIEWABLE_STATUSES. */
const PAID_FAMILY_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class ShopAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── KPI overview (revenue / orders / AOV / pipeline counts) ─────────────

  async getOverview(days = 30): Promise<{
    totalOrders: number;
    totalRevenueCents: number;
    avgOrderCents: number;
    pendingOrders: number;
    processingOrders: number;
  }> {
    const [revenueAgg, pendingOrders, processingOrders] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: { in: PAID_FAMILY_STATUSES }, createdAt: { gte: since(days) } },
        _sum: { totalCents: true },
        _count: { id: true },
      }),
      this.prisma.order.count({ where: { status: 'awaiting_payment' } }),
      this.prisma.order.count({ where: { status: 'processing' } }),
    ]);

    const totalRevenueCents = revenueAgg._sum.totalCents ?? 0;
    const totalOrders = revenueAgg._count.id ?? 0;
    const avgOrderCents = totalOrders > 0 ? Math.round(totalRevenueCents / totalOrders) : 0;

    return { totalOrders, totalRevenueCents, avgOrderCents, pendingOrders, processingOrders };
  }

  // ── Best sellers (by units sold) ─────────────────────────────────────────

  async getBestSellers(days = 30, limit = 10): Promise<Array<{ productId: string; title: string; totalSold: number; revenueCents: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ productId: string; title: string; totalSold: bigint; revenueCents: bigint }>>`
      SELECT
        i."productId" AS "productId",
        MAX(i."titleSnapshot") AS title,
        SUM(i.quantity)::bigint AS "totalSold",
        SUM(i."totalCents")::bigint AS "revenueCents"
      FROM shop_order_items i
      JOIN shop_orders o ON o.id = i."orderId"
      WHERE o.status::text IN (${Prisma.join(PAID_FAMILY_STATUSES)})
        AND o."createdAt" >= ${since(days)}
        AND i."productId" IS NOT NULL
      GROUP BY i."productId"
      ORDER BY SUM(i.quantity) DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      productId: r.productId,
      title: r.title,
      totalSold: Number(r.totalSold),
      revenueCents: Number(r.revenueCents),
    }));
  }

  // ── Daily revenue series ──────────────────────────────────────────────────

  async getRevenueSeries(days = 30): Promise<Array<{ date: string; revenueCents: number; orders: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; revenueCents: bigint | null; orders: bigint }>>`
      SELECT
        DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day,
        SUM("totalCents")::bigint AS "revenueCents",
        COUNT(id)::bigint AS orders
      FROM shop_orders
      WHERE status::text IN (${Prisma.join(PAID_FAMILY_STATUSES)})
        AND "createdAt" >= ${since(days)}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      revenueCents: Number(r.revenueCents ?? 0),
      orders: Number(r.orders ?? 0),
    }));
  }

  // ── Customer insights (new vs. total, top spenders) ──────────────────────

  async getCustomerInsights(days = 30): Promise<{
    totalCustomers: number;
    newCustomers: number;
    topSpenders: Array<{ customerId: string; email: string; totalCents: number; orderCount: number }>;
  }> {
    const [totalCustomers, newCustomers, spenders] = await Promise.all([
      this.prisma.shopCustomer.count(),
      this.prisma.shopCustomer.count({ where: { createdAt: { gte: since(days) } } }),
      this.prisma.order.groupBy({
        by: ['customerId', 'customerEmail'],
        where: { status: { in: PAID_FAMILY_STATUSES }, customerId: { not: null } },
        _sum: { totalCents: true },
        _count: { id: true },
        orderBy: { _sum: { totalCents: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      totalCustomers,
      newCustomers,
      topSpenders: spenders.map((r) => ({
        customerId: r.customerId as string,
        email: r.customerEmail,
        totalCents: r._sum.totalCents ?? 0,
        orderCount: r._count.id,
      })),
    };
  }

  // ── Promotion / coupon performance ────────────────────────────────────────

  async getPromotionPerformance(days = 30): Promise<Array<{ code: string; name: string; usesCount: number; discountCents: number }>> {
    const [rows, promos] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['couponCode'],
        where: { couponCode: { not: null }, status: { in: PAID_FAMILY_STATUSES }, createdAt: { gte: since(days) } },
        _sum: { discountCents: true },
        _count: { id: true },
        orderBy: { _sum: { discountCents: 'desc' } },
      }),
      this.prisma.shopPromotion.findMany({ select: { code: true, name: true, usesCount: true } }),
    ]);

    const nameMap = new Map(promos.filter((p) => p.code).map((p) => [p.code as string, p.name]));

    return rows.map((r) => {
      const code = r.couponCode as string;
      return {
        code,
        name: nameMap.get(code) ?? code,
        usesCount: r._count.id,
        discountCents: r._sum.discountCents ?? 0,
      };
    });
  }

  // ── Inventory analytics (low-stock / out-of-stock overview) ──────────────

  async getInventoryAnalytics(): Promise<{
    totalItems: number;
    outOfStock: number;
    lowStock: number;
    lowStockItems: Array<{ variantId: string; productId: string; available: number; lowStockThreshold: number }>;
  }> {
    const [totalItems, outOfStock, lowStockCountRows, lowStockRows] = await Promise.all([
      this.prisma.inventoryItem.count(),
      this.prisma.inventoryItem.count({ where: { available: 0 } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM shop_inventory_items WHERE available > 0 AND available <= "lowStockThreshold"
      `,
      this.prisma.$queryRaw<Array<{ variantId: string; productId: string; available: number; lowStockThreshold: number }>>`
        SELECT "variantId", "productId", available, "lowStockThreshold"
        FROM shop_inventory_items
        WHERE available > 0 AND available <= "lowStockThreshold"
        ORDER BY available ASC
        LIMIT 20
      `,
    ]);

    return {
      totalItems,
      outOfStock,
      lowStock: Number(lowStockCountRows[0]?.count ?? 0),
      lowStockItems: lowStockRows.map((r) => ({
        variantId: r.variantId,
        productId: r.productId,
        available: r.available,
        lowStockThreshold: r.lowStockThreshold,
      })),
    };
  }
}
