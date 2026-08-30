import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../common/redis-lock/redis-lock.service';
import { CRON_LOCK_TTL } from '../common/redis-lock/cron-lock.constants';
import { PrismaService } from '../prisma/prisma.service';
import { GcsService } from '../gcs/gcs.service';
import { REPLAY_RETENTION_DAYS } from './replay.constants';

@Injectable()
export class ReplayRetentionService {
  private readonly logger = new Logger(ReplayRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly lock: RedisLockService,
  ) {}

  // Deletes GCS objects and DB rows — running it on every replica would have
  // each pod racing to delete the same sessions.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeOldSessions(): Promise<void> {
    await this.lock.runOncePerWindow(
      'replay-retention-purge',
      CRON_LOCK_TTL.day,
      () => this.purge(),
    );
  }

  private async purge(): Promise<void> {
    const cutoff = new Date(Date.now() - REPLAY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.prisma.replaySession.findMany({ where: { startedAt: { lt: cutoff } }, include: { chunks: true } });
    if (!expired.length) return;

    for (const session of expired) {
      await Promise.allSettled(session.chunks.map((c) => this.gcs.delete(c.gcsObjectKey)));
      await this.prisma.replaySession.delete({ where: { id: session.id } }); // cascades events + chunk rows
    }
    this.logger.log(`Purged ${expired.length} replay session(s) older than ${REPLAY_RETENTION_DAYS} days`);
  }
}
