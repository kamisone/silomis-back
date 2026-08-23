import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CheckoutSessionService } from './checkout-session.service';

@Injectable()
export class CheckoutSessionCleanupService {
  private readonly logger = new Logger(CheckoutSessionCleanupService.name);

  constructor(private readonly sessionService: CheckoutSessionService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredSessions(): Promise<void> {
    const deleted = await this.sessionService.deleteExpired();
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} expired checkout session(s)`);
    }
  }
}
