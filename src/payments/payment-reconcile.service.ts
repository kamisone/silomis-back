import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../common/redis-lock/redis-lock.service';
import { ShopPaymentService } from './shop-payment.service';

/**
 * The safety net under the Stripe webhook.
 *
 * A payment the webhook never reported — the endpoint not registered for
 * this environment, a secret that does not match, retries exhausted during
 * an outage — would leave a paid order at "awaiting payment" forever, with
 * no confirmation to the customer and no alert to the desk. Every five
 * minutes any recent order still waiting, with an intent, is checked against
 * Stripe and settled if the money is there. Locked, so replicas take turns.
 */
@Injectable()
export class PaymentReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentReconcileService.name);

  constructor(
    private readonly payment: ShopPaymentService,
    private readonly lock: RedisLockService,
  ) {}

  onApplicationBootstrap(): void {
    // A deploy that happened while a webhook was retrying is exactly when a
    // sweep is worth running early.
    const timer = setTimeout(() => void this.sweep(), 30_000);
    timer.unref?.();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    await this.lock.runOncePerWindow('payment-reconcile', 4 * 60_000, async () => {
      const n = await this.payment.reconcilePending();
      if (n > 0) this.logger.warn(`Settled ${n} paid order(s) the webhook had not confirmed`);
    });
  }
}
