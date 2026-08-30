import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';

/**
 * Releases a lock only if this process still owns it. A plain DEL would let a
 * job that overran its TTL delete the lock a *different* replica has since
 * acquired, which is exactly the double-run this service exists to prevent.
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Cross-replica mutual exclusion for work that must happen once per cluster,
 * not once per pod.
 *
 * Every @Cron in this app is registered by @nestjs/schedule inside *each* API
 * process, so with an HPA scaling the Deployment to N replicas every scheduled
 * job fires N times. Wrapping the body in `runOncePerWindow` means the first
 * replica to reach Redis wins and the rest no-op.
 *
 * Failure mode is deliberately closed: if Redis is unreachable the lock is
 * treated as *not* acquired and the job is skipped. Failing open would restore
 * the N-way duplicate run precisely during an incident, which is worse for
 * anything that sends mail or deletes rows than simply missing a tick.
 */
@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Runs `fn` on at most one replica per `ttlMs` window.
   *
   * The lock is intentionally NOT released when `fn` finishes: it is left to
   * expire. Releasing early would let a second replica whose clock is a few
   * hundred milliseconds behind acquire the lock and run the same tick again.
   * Pick `ttlMs` a little under the cron interval (see CRON_LOCK_TTL) so the
   * next scheduled run always finds the key gone.
   *
   * @returns true if this replica ran the job, false if another replica held
   *          the lock or Redis was unreachable.
   */
  async runOncePerWindow<T>(
    name: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<boolean> {
    const token = await this.acquire(name, ttlMs);
    if (!token) return false;

    this.logger.debug(`Acquired cron lock "${name}" for ${ttlMs}ms`);
    await fn();
    return true;
  }

  /**
   * Runs `fn` under a lock that is released as soon as it finishes, for work
   * that is triggered on demand rather than on a fixed schedule and should
   * become runnable again immediately. Use `runOncePerWindow` for @Cron.
   */
  async runExclusive<T>(
    name: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<boolean> {
    const token = await this.acquire(name, ttlMs);
    if (!token) return false;

    try {
      await fn();
    } finally {
      await this.release(name, token);
    }
    return true;
  }

  /** @returns the ownership token, or null if the lock is held elsewhere. */
  async acquire(name: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    try {
      const res = await this.redis.client.set(
        this.key(name),
        token,
        'PX',
        ttlMs,
        'NX',
      );
      return res === 'OK' ? token : null;
    } catch (err) {
      this.logger.error(
        `Redis unreachable acquiring lock "${name}" — skipping this run: ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  async release(name: string, token: string): Promise<void> {
    try {
      await this.redis.client.eval(RELEASE_SCRIPT, 1, this.key(name), token);
    } catch (err) {
      // Not fatal: the TTL will clear it. Logged because a persistent failure
      // here means locks are being held for their full TTL rather than the
      // job duration, which shows up as skipped runs.
      this.logger.warn(
        `Failed to release lock "${name}" (will expire naturally): ${(err as Error)?.message}`,
      );
    }
  }

  private key(name: string): string {
    return `lock:cron:${name}`;
  }
}
