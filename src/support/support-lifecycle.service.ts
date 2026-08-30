import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../common/redis-lock/redis-lock.service';
import { CRON_LOCK_TTL } from '../common/redis-lock/cron-lock.constants';
import { SupportConversationsService } from './support-conversations.service';
import { SupportNotificationService } from './support-notification.service';
import { SupportGateway } from './support.gateway';
import { SupportConversationStatus } from '../../generated/prisma/client';

@Injectable()
export class SupportLifecycleService {
  private readonly logger = new Logger(SupportLifecycleService.name);

  constructor(
    private readonly convService: SupportConversationsService,
    private readonly notifService: SupportNotificationService,
    private readonly gateway: SupportGateway,
    private readonly lock: RedisLockService,
  ) {}

  // Auto-close writes rows and pushes socket events, so it must run on one
  // replica only — otherwise every scaled pod repeats the same hourly sweep.
  @Cron(CronExpression.EVERY_HOUR)
  async autoCloseInactiveConversations(): Promise<void> {
    await this.lock.runOncePerWindow(
      'support-auto-close',
      CRON_LOCK_TTL.hour,
      () => this.autoClose(),
    );
  }

  private async autoClose(): Promise<void> {
    try {
      const settings = await this.notifService.getSettings();
      const closedIds = await this.convService.autoCloseConversations(
        settings.inactiveCloseHours,
      );

      if (closedIds.length === 0) return;

      this.logger.log(`Auto-closed ${closedIds.length} inactive conversations`);

      for (const id of closedIds) {
        this.gateway.emitConversationUpdate(id, {
          status: SupportConversationStatus.closed,
          autoClose: true,
        });
      }
    } catch (err) {
      this.logger.error(`Auto-close job failed: ${(err as Error).message}`);
    }
  }
}
