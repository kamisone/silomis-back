import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ShopAnalyticsService } from './shop-analytics.service';
import { RedisService } from '../redis/redis.service';

export const ANALYTICS_CACHE_TTL = 90_000; // 25 hours in seconds

export const ANALYTICS_KEYS = {
  overview7d: 'shop:analytics:overview:7d',
  overview30d: 'shop:analytics:overview:30d',
  bestSellers7d: 'shop:analytics:best-sellers:7d',
  bestSellers30d: 'shop:analytics:best-sellers:30d',
  revenueSeries7d: 'shop:analytics:revenue-series:7d',
  revenueSeries30d: 'shop:analytics:revenue-series:30d',
  computedAt: 'shop:analytics:computed-at',
} as const;

@Injectable()
export class ShopAnalyticsAggregatorService {
  private readonly logger = new Logger(ShopAnalyticsAggregatorService.name);

  constructor(
    private readonly analytics: ShopAnalyticsService,
    private readonly redis: RedisService,
  ) {}

  // ── Nightly aggregation at 03:00 UTC ──────────────────────────────────────

  @Cron('0 3 * * *')
  async runNightlyAggregation(): Promise<void> {
    this.logger.log('Starting nightly shop analytics aggregation');
    await this.aggregate();
  }

  async aggregate(): Promise<void> {
    try {
      const [overview7d, overview30d, bestSellers7d, bestSellers30d, revenueSeries7d, revenueSeries30d] = await Promise.all([
        this.analytics.getOverview(7),
        this.analytics.getOverview(30),
        this.analytics.getBestSellers(7),
        this.analytics.getBestSellers(30),
        this.analytics.getRevenueSeries(7),
        this.analytics.getRevenueSeries(30),
      ]);

      const pipeline = this.redis.client.pipeline();
      pipeline.set(ANALYTICS_KEYS.overview7d, JSON.stringify(overview7d), 'EX', ANALYTICS_CACHE_TTL);
      pipeline.set(ANALYTICS_KEYS.overview30d, JSON.stringify(overview30d), 'EX', ANALYTICS_CACHE_TTL);
      pipeline.set(ANALYTICS_KEYS.bestSellers7d, JSON.stringify(bestSellers7d), 'EX', ANALYTICS_CACHE_TTL);
      pipeline.set(ANALYTICS_KEYS.bestSellers30d, JSON.stringify(bestSellers30d), 'EX', ANALYTICS_CACHE_TTL);
      pipeline.set(ANALYTICS_KEYS.revenueSeries7d, JSON.stringify(revenueSeries7d), 'EX', ANALYTICS_CACHE_TTL);
      pipeline.set(ANALYTICS_KEYS.revenueSeries30d, JSON.stringify(revenueSeries30d), 'EX', ANALYTICS_CACHE_TTL);
      pipeline.set(ANALYTICS_KEYS.computedAt, new Date().toISOString(), 'EX', ANALYTICS_CACHE_TTL);
      await pipeline.exec();

      this.logger.log('Shop analytics aggregation complete');
    } catch (err) {
      this.logger.error('Analytics aggregation failed', (err as Error).message);
    }
  }

  // ── Read from cache (falls back to a live query on cache miss) ───────────

  async getOverviewCached(days: 7 | 30): Promise<Awaited<ReturnType<ShopAnalyticsService['getOverview']>>> {
    const key = days === 7 ? ANALYTICS_KEYS.overview7d : ANALYTICS_KEYS.overview30d;
    const hit = await this.redis.client.get(key);
    if (hit) return JSON.parse(hit);
    return this.analytics.getOverview(days);
  }

  async getBestSellersCached(days: 7 | 30, limit = 10): Promise<Awaited<ReturnType<ShopAnalyticsService['getBestSellers']>>> {
    const key = days === 7 ? ANALYTICS_KEYS.bestSellers7d : ANALYTICS_KEYS.bestSellers30d;
    const hit = await this.redis.client.get(key);
    if (hit) {
      const all = JSON.parse(hit) as Awaited<ReturnType<ShopAnalyticsService['getBestSellers']>>;
      return all.slice(0, limit);
    }
    return this.analytics.getBestSellers(days, limit);
  }

  async getRevenueSeriesCached(days: 7 | 30): Promise<Awaited<ReturnType<ShopAnalyticsService['getRevenueSeries']>>> {
    const key = days === 7 ? ANALYTICS_KEYS.revenueSeries7d : ANALYTICS_KEYS.revenueSeries30d;
    const hit = await this.redis.client.get(key);
    if (hit) return JSON.parse(hit);
    return this.analytics.getRevenueSeries(days);
  }

  async getComputedAt(): Promise<string | null> {
    return this.redis.client.get(ANALYTICS_KEYS.computedAt);
  }
}
