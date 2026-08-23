import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqService } from './dlq.service';

/**
 * Base class for all BullMQ processors. The @OnWorkerEvent('failed') handler
 * fires on every failure attempt; we only route to the DLQ when retries are
 * exhausted so intermediate transient errors don't spam the dead-letter queue.
 */
export abstract class DlqAwareWorker extends WorkerHost {
  protected abstract readonly queueName: string;

  constructor(protected readonly dlqService: DlqService) {
    super();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error): Promise<void> {
    if (!job) return;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await this.dlqService.route(this.queueName, job, error);
    }
  }
}
