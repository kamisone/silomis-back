import type { RedisOptions } from 'ioredis';

/**
 * Connection settings for the cache/rate-limit/lock Redis, shared by every
 * client that talks to it: RedisService, the throttler storage, and the
 * socket.io pub/sub adapter. Kept in one place so scaling out doesn't mean
 * three drifting copies of the same host/port/password lookup.
 *
 * BullMQ deliberately does NOT use this — it has its own BULLMQ_REDIS_* vars
 * (see BullModule.forRootAsync in app.module.ts) so queued jobs can live on an
 * instance with a noeviction policy.
 */
export function baseRedisOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD ?? undefined,
    db: Number(process.env.REDIS_DB ?? 0),

    // Never give up. Returning null makes ioredis emit 'end' and stop
    // reconnecting for the lifetime of the process — a transient DNS blip
    // would then leave this process with a permanently dead Redis client
    // until it is restarted.
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),

    // ioredis defaults this to 20: after 20 reconnect attempts it rejects
    // every queued command with MaxRetriesPerRequestError. For the socket.io
    // adapter's internal SUBSCRIBE that rejection has no catch attached, so it
    // surfaced as an unhandled rejection and killed the whole API process —
    // a Redis outage became a back-deployment crash loop.
    //
    // null means "queue and keep retrying, never reject on retry count".
    // Clients that must fail fast instead of waiting set `commandTimeout`,
    // which still rejects individual commands on its own timer.
    maxRetriesPerRequest: null,

    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 5_000,
  };
}
