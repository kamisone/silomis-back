/**
 * AssetUrlService — canonical source of truth for all GCS URL resolution.
 *
 * Routing rules:
 *  - media/* paths (product images, swatches, gallery) → stable public CDN URL.
 *    No signing, no Redis, no expiry. Requires the GCS bucket to have
 *    allUsers:Storage Object Viewer on the media/ prefix (or the whole bucket).
 *  - All other paths (shop-receipts/*, invoices/*, …) → V4 signed URL, cached
 *    in Redis for 55 minutes (5-minute safety buffer vs 1-hour GCS TTL).
 *    Redis failure falls back to live signing so no request is broken by a cache outage.
 */

import { Injectable, Logger } from '@nestjs/common';
import { GcsService } from '../gcs/gcs.service';
import { RedisService } from '../redis/redis.service';

/** Paths that are publicly readable in GCS — no signing required. */
const PUBLIC_PREFIXES = ['media/'];

/** GCS V4 signed URL TTL — must stay in sync with gcs.service.ts. */
const GCS_TTL_MS = 60 * 60 * 1_000; // 1 hour
/** Redis cache TTL: GCS TTL minus 5-minute safety buffer. */
const CACHE_TTL_S = 55 * 60; // 3300 s
/** Regenerate when remaining lifetime is below this threshold. */
const REFRESH_FLOOR_MS = 5 * 60 * 1_000; // 5 min

const KEY_PREFIX = 'asset:surl:';

@Injectable()
export class AssetUrlService {
  private readonly logger = new Logger(AssetUrlService.name);

  constructor(
    private readonly gcs: GcsService,
    private readonly redis: RedisService,
  ) {}

  // ── Public/private routing ─────────────────────────────────────────────

  private isPublic(objectPath: string): boolean {
    return PUBLIC_PREFIXES.some((p) => objectPath.startsWith(p));
  }

  // ── Core resolution ──────────────────────────────────────────────────

  /** Resolve a single GCS object path → URL. Public paths are instant; private paths are signed + cached. */
  async resolve(objectPath: string): Promise<string> {
    if (this.isPublic(objectPath)) return this.gcs.publicUrl(objectPath);
    const cached = await this.getCached(objectPath);
    if (cached) return cached;
    return this.sign(objectPath);
  }

  /**
   * Resolve multiple GCS object paths in one Redis round-trip (for private paths).
   * Returns a Map<objectPath, url>.
   */
  async resolveBatch(objectPaths: string[]): Promise<Map<string, string>> {
    if (!objectPaths.length) return new Map();

    const unique = [...new Set(objectPaths)];
    const result = new Map<string, string>();

    const publicPaths = unique.filter((p) => this.isPublic(p));
    const privatePaths = unique.filter((p) => !this.isPublic(p));

    // Public paths: synchronous, no network call needed.
    for (const p of publicPaths) {
      result.set(p, this.gcs.publicUrl(p));
    }

    // Private paths: Redis batch-GET, sign misses in parallel.
    if (privatePaths.length) {
      const keys = privatePaths.map((p) => `${KEY_PREFIX}${p}`);
      let raws: (string | null)[] = new Array(privatePaths.length).fill(null);
      try {
        raws = await this.redis.client.mget(...keys);
      } catch (e) {
        this.logger.warn('Redis MGET failed, falling back to live signing', e);
      }

      const misses: string[] = [];
      for (let i = 0; i < privatePaths.length; i++) {
        const cached = this.parseCacheValue(raws[i]);
        if (cached) {
          result.set(privatePaths[i], cached);
        } else {
          misses.push(privatePaths[i]);
        }
      }

      if (misses.length) {
        const signed = await Promise.all(misses.map((p) => this.sign(p)));
        for (let i = 0; i < misses.length; i++) {
          result.set(misses[i], signed[i]);
        }
      }
    }

    return result;
  }

  /** Immediately evict a cached URL — call on asset deletion or replacement. */
  async invalidate(objectPath: string): Promise<void> {
    if (this.isPublic(objectPath)) return; // public URLs don't need cache invalidation
    try {
      await this.redis.client.del(`${KEY_PREFIX}${objectPath}`);
    } catch (e) {
      this.logger.warn(`Failed to invalidate cache for ${objectPath}`, e);
    }
  }

  /**
   * Evict all cached URLs whose paths start with a given prefix.
   * Uses SCAN — safe for production Redis (no KEYS *).
   */
  async invalidatePrefix(prefix: string): Promise<void> {
    if (this.isPublic(prefix)) return; // public URLs don't need cache invalidation
    const pattern = `${KEY_PREFIX}${prefix}*`;
    try {
      await this.scanAndDelete(pattern);
    } catch (e) {
      this.logger.warn(`Failed to invalidate prefix ${prefix}`, e);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async getCached(objectPath: string): Promise<string | null> {
    try {
      const raw = await this.redis.client.get(`${KEY_PREFIX}${objectPath}`);
      return this.parseCacheValue(raw);
    } catch {
      return null;
    }
  }

  private parseCacheValue(raw: string | null): string | null {
    if (!raw) return null;
    const sep = raw.lastIndexOf('|');
    if (sep === -1) return null;
    const expiresAt = Number(raw.slice(sep + 1));
    if (!expiresAt || expiresAt - Date.now() < REFRESH_FLOOR_MS) return null;
    return raw.slice(0, sep);
  }

  private async sign(objectPath: string): Promise<string> {
    const url = await this.gcs.signedUrl(objectPath);
    const expiresAt = Date.now() + GCS_TTL_MS;
    const value = `${url}|${expiresAt}`;
    try {
      await this.redis.client.setex(`${KEY_PREFIX}${objectPath}`, CACHE_TTL_S, value);
    } catch (e) {
      this.logger.warn(`Redis SETEX failed for ${objectPath} — URL served uncached`, e);
    }
    return url;
  }

  private async scanAndDelete(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await this.redis.client.del(...keys);
    } while (cursor !== '0');
  }
}
