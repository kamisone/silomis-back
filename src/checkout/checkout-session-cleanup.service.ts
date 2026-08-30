import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../common/redis-lock/redis-lock.service';
import { CRON_LOCK_TTL } from '../common/redis-lock/cron-lock.constants';
import { CheckoutSessionService } from './checkout-session.service';

@Injectable()
export class CheckoutSessionCleanupService {
  private readonly logger = new Logger(CheckoutSessionCleanupService.name);

  constructor(
    private readonly sessionService: CheckoutSessionService,
    private readonly lock: RedisLockService,
  ) {}

  // Locked so N replicas don't all issue the same bulk delete at 03:00.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredSessions(): Promise<void> {
    await this.lock.runOncePerWindow(
      'checkout-session-cleanup',
      CRON_LOCK_TTL.day,
      () => this.cleanup(),
    );
  }

  private async cleanup(): Promise<void> {
    const deleted = await this.sessionService.deleteExpired();
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} expired checkout session(s)`);
    }
  }
}
