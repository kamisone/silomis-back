import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GcsService } from '../gcs/gcs.service';
import { REPLAY_RETENTION_DAYS } from './replay.constants';

@Injectable()
export class ReplayRetentionService {
  private readonly logger = new Logger(ReplayRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeOldSessions(): Promise<void> {
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
