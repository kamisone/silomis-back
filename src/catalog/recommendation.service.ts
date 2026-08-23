import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { Prisma } from '../../generated/prisma/client';

const TTL_SECONDS = 3600; // 1 hour cache

/** Order statuses that count as a completed purchase for co-occurrence analysis. */
const PAID_STATUSES: string[] = ['paid', 'processing', 'shipped', 'delivered'];

export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  minPriceCents: number | null;
  featuredImageUrl: string | null;
  freeShipping: boolean;
}

interface FbtRow {
  productId: string;
  co_count: number;
}

interface SimilarRow {
  id: string;
  overlap: number;
}

interface SummaryRow {
  id: string;
  slug: string;
  title: string;
  featuredImageKey: string | null;
  freeShipping: boolean;
  priceCents: number | bigint | null;
}

/**
 * Cross-sell recommendations for the storefront PDP: "frequently bought
 * together" (co-purchase analysis over paid orders) and "similar products"
 * (category/tag overlap). Both are cached in Redis and invalidated whenever
 * the source product changes (see RecommendationListener).
 */
@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly assetUrl: AssetUrlService,
  ) {}

  // ── Frequently bought together ──────────────────────────────────────────
  // Products that most often appear alongside this one in the same
  // completed order (shop_order_items self-joined on shop orderId).

  async getFrequentlyBoughtTogether(productId: string, limit = 6): Promise<ProductSummary[]> {
    const cacheKey = `shop:reco:fbt:${productId}:${limit}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as ProductSummary[];

    const rows = await this.prisma.$queryRaw<FbtRow[]>`
      SELECT i2."productId" AS "productId", COUNT(*)::int AS co_count
      FROM shop_order_items i1
      JOIN shop_order_items i2
        ON i1."orderId" = i2."orderId"
       AND i2."productId" != i1."productId"
      JOIN shop_orders o ON o.id = i1."orderId"
      WHERE i1."productId" = ${productId}
        AND o.status IN (${Prisma.join(PAID_STATUSES)})
        AND i2."productId" IS NOT NULL
      GROUP BY i2."productId"
      ORDER BY co_count DESC
      LIMIT ${limit}
    `;

    const ids = rows.map((r) => r.productId);
    if (!ids.length) {
      await this.redis.client.set(cacheKey, '[]', 'EX', TTL_SECONDS);
      return [];
    }

    const result = await this.fetchSummaries(ids);
    await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', TTL_SECONDS);
    return result;
  }

  // ── Similar products ────────────────────────────────────────────────────
  // Active products sharing the most category/tag overlap with this one,
  // via the implicit m2m join tables _ProductCategoryMap / _ProductTagMap.

  async getSimilarProducts(productId: string, limit = 6): Promise<ProductSummary[]> {
    const cacheKey = `shop:reco:similar:${productId}:${limit}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as ProductSummary[];

    const rows = await this.prisma.$queryRaw<SimilarRow[]>`
      SELECT p.id,
             (COUNT(DISTINCT cat."B") + COUNT(DISTINCT tag."B"))::int AS overlap
      FROM shop_products p
      LEFT JOIN "_ProductCategoryMap" cat ON cat."A" = p.id
      LEFT JOIN "_ProductTagMap" tag ON tag."A" = p.id
      WHERE p.id != ${productId}
        AND p.status = 'active'
        AND p."deletedAt" IS NULL
        AND (
          cat."B" IN (
            SELECT "B" FROM "_ProductCategoryMap" WHERE "A" = ${productId}
          )
          OR tag."B" IN (
            SELECT "B" FROM "_ProductTagMap" WHERE "A" = ${productId}
          )
        )
      GROUP BY p.id
      ORDER BY overlap DESC
      LIMIT ${limit}
    `;

    const ids = rows.map((r) => r.id);
    if (!ids.length) {
      await this.redis.client.set(cacheKey, '[]', 'EX', TTL_SECONDS);
      return [];
    }

    const result = await this.fetchSummaries(ids);
    await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', TTL_SECONDS);
    return result;
  }

  // ── Invalidate cache when the source product changes ────────────────────

  async invalidateProduct(productId: string): Promise<void> {
    const keys = await this.redis.client.keys(`shop:reco:*:${productId}:*`);
    if (keys.length) await this.redis.client.del(...keys);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  async fetchSummaries(ids: string[]): Promise<ProductSummary[]> {
    if (!ids.length) return [];

    const rows = await this.prisma.$queryRaw<SummaryRow[]>`
      SELECT p.id, p.slug, p.title, p."featuredImageKey", p."freeShipping",
             COALESCE(v."priceCents", p."basePriceCents") AS "priceCents"
      FROM shop_products p
      LEFT JOIN shop_product_variants v ON v."productId" = p.id AND v."isDefault" = true
      WHERE p.id IN (${Prisma.join(ids)})
        AND p.status = 'active'
        AND p."deletedAt" IS NULL
    `;

    const urlMap = await this.assetUrl.resolveBatch(rows.map((r) => r.featuredImageKey).filter((k): k is string => k != null));

    const byId = new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          slug: r.slug,
          title: r.title,
          featuredImageUrl: r.featuredImageKey ? (urlMap.get(r.featuredImageKey) ?? null) : null,
          minPriceCents: r.priceCents != null ? Number(r.priceCents) : null,
          freeShipping: r.freeShipping === true,
        } satisfies ProductSummary,
      ]),
    );

    // Preserve the original ranking order (by co-occurrence / overlap count),
    // dropping any id that fetchSummaries filtered out (inactive/deleted).
    return ids.map((id) => byId.get(id)).filter((s): s is ProductSummary => s != null);
  }
}
