import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../common/redis-lock/redis-lock.service';
import { CRON_LOCK_TTL } from '../common/redis-lock/cron-lock.constants';
import { SendInService } from './send-in.service';

/**
 * Catches the mockups the order-time render did not produce.
 *
 * That render is a timer in whichever process took the order; a deploy in
 * the same second, or storage answering slowly, and the desk opens a job
 * with the customer's bare photo and no picture of the design on it. Once
 * shortly after boot and then every ten minutes, any side still without a
 * mockup is drawn — locked, so N replicas do not all download the same
 * photos.
 */
@Injectable()
export class SendInMockupSweepService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SendInMockupSweepService.name);

  constructor(
    private readonly sendIn: SendInService,
    private readonly lock: RedisLockService,
  ) {}

  onApplicationBootstrap(): void {
    // After the seed and the first requests, not in their way.
    const timer = setTimeout(() => void this.sweep(), 20_000);
    timer.unref?.();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    await this.lock.runOncePerWindow('send-in-mockup-sweep', CRON_LOCK_TTL.minute * 9, async () => {
      const n = await this.sendIn.renderMissingMockups();
      if (n > 0) this.logger.log(`Drew ${n} missing send-in mockup(s)`);
    });
  }
}
