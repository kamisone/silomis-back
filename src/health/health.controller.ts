import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DLQ_QUEUE } from '../dlq/dlq.constants';

interface CheckResult {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
  [key: string]: unknown;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(DLQ_QUEUE) private readonly dlqQueue: Queue,
  ) {}

  @Get()
  async check() {
    const [dbR, redisR, queuesR] = await Promise.allSettled([
      this.checkDb(),
      this.checkRedis(),
      this.checkQueues(),
    ]);

    const db = dbR.status === 'fulfilled' ? dbR.value : { status: 'down' as const, error: String((dbR as PromiseRejectedResult).reason) };
    const red = redisR.status === 'fulfilled' ? redisR.value : { status: 'down' as const, error: String((redisR as PromiseRejectedResult).reason) };
    const queues = queuesR.status === 'fulfilled' ? queuesR.value : { status: 'down' as const };

    const overall =
      db.status === 'down' || red.status === 'down'
        ? 'down'
        : Object.values(queues).some((q) => (q as CheckResult)?.status === 'degraded')
          ? 'degraded'
          : 'ok';

    return {
      status: overall,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      db,
      redis: red,
      queues,
    };
  }

  private async checkDb(): Promise<CheckResult> {
    const t0 = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - t0 };
  }

  private async checkRedis(): Promise<CheckResult> {
    const t0 = Date.now();
    await this.redis.client.ping();
    return { status: 'ok', latencyMs: Date.now() - t0 };
  }

  private async checkQueues() {
    const dlq = await this.dlqQueue.getJobCounts('waiting');

    return {
      [DLQ_QUEUE]: {
        status: dlq.waiting > 0 ? 'degraded' : 'ok',
        depth: dlq.waiting,
      },
    };
  }
}
