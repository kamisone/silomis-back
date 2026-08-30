import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { baseRedisOptions } from './redis.options';

/** Cap on how often a Redis connection error is logged while it stays down. */
const ERROR_LOG_INTERVAL_MS = 30_000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client: Redis;
  private lastErrorLoggedAt = 0;
  private suppressedErrors = 0;

  // This client is used for cache, idempotency keys, MFA OTPs, and rate limiting.
  // Recommended: maxmemory-policy allkeys-lru (stale cache can be evicted safely).
  // BullMQ jobs use a separate connection — see BullModule.forRootAsync in app.module.ts.
  onModuleInit(): void {
    this._client = new Redis({
      ...baseRedisOptions(),

      // Bounds every command so an unreachable Redis degrades instead of
      // hanging. Callers already fall back on a rejected promise, but a
      // catch block never runs while a promise is simply pending.
      commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 1_000),
    });

    this._client.on('connect', () => this.logger.log('Redis connected'));
    this._client.on('ready', () => {
      if (this.suppressedErrors) {
        this.logger.log(`Redis ready (suppressed ${this.suppressedErrors} error log(s) while down)`);
        this.suppressedErrors = 0;
      } else {
        this.logger.log('Redis ready');
      }
      this.lastErrorLoggedAt = 0;
    });
    this._client.on('reconnecting', () => this.logger.debug('Redis reconnecting…'));

    // Retrying forever means an outage emits an error every few seconds. Log
    // at most one per interval so a Redis outage cannot bury every other log line.
    this._client.on('error', (e) => {
      const now = Date.now();
      if (now - this.lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) {
        this.suppressedErrors++;
        return;
      }
      this.lastErrorLoggedAt = now;
      this.logger.error(`Redis error: ${e?.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this._client?.quit();
  }

  /** Raw ioredis client for advanced use (Lua eval, pipelines, etc.) */
  get client(): Redis {
    return this._client;
  }
}
