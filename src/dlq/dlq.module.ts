import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DLQ_QUEUE } from './dlq.constants';
import { DlqService } from './dlq.service';

/**
 * Provides the dead-letter queue. Import this module in any feature module
 * that has a BullMQ processor, so permanently-failed jobs are routed here
 * instead of being silently dropped.
 *
 * The DLQ has no worker — jobs accumulate in "waiting" state for manual
 * inspection and replay. Alert on anything landing here (the DlqService logs
 * at ERROR level on every entry).
 */
@Module({
  imports: [BullModule.registerQueue({ name: DLQ_QUEUE })],
  providers: [DlqService],
  exports: [DlqService],
})
export class DlqModule {}
