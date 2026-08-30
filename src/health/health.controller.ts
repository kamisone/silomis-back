import {
  BeforeApplicationShutdown,
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
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
export class HealthController implements BeforeApplicationShutdown {
  private readonly logger = new Logger(HealthController.name);

  /**
   * Flipped as soon as Kubernetes sends SIGTERM. The readiness probe then
   * fails, the endpoints controller pulls this pod out of the Service, and
   * in-flight requests drain against a pod that is no longer receiving new
   * ones. Without it, kube-proxy keeps routing to a pod that is already
   * shutting down and clients see connection resets on every scale-down.
   */
  private shuttingDown = false;

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

  /**
   * Liveness. Deliberately checks nothing but the process itself: if this
   * probed the database, a brief Postgres blip would make the kubelet restart
   * every API pod at once and turn a recoverable dependency outage into a
   * full outage.
   */
  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  /**
   * Readiness. Returns 503 while the pod is booting, while shutdown has begun,
   * or while the database is unreachable — that status code is what removes
   * the pod from the Service's endpoints.
   *
   * Only Postgres gates readiness. Redis, the queues and the DLQ are reported
   * but never fail the probe, because every replica shares the same Redis: if
   * it gated readiness, one Redis restart would mark *all* pods NotReady at
   * once, empty the Service's endpoint list, and turn a degraded-cache
   * incident into a hard 503 for the entire site. The app already treats Redis
   * as optional at every call site (cache misses fall through, cron ticks are
   * skipped), so a pod with Redis down can still serve pages and take orders.
   *
   * The rule of thumb: fail readiness only for things that make *this pod*
   * unable to serve while other pods still can. A shared dependency being down
   * is an alerting condition, not a routing one.
   */
  @Get('ready')
  async ready() {
    if (this.shuttingDown) {
      throw new ServiceUnavailableException({ status: 'shutting-down' });
    }

    const [dbR, redisR] = await Promise.allSettled([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const redis =
      redisR.status === 'fulfilled'
        ? redisR.value
        : { status: 'down' as const, error: String(redisR.reason) };

    if (dbR.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'down',
        db: { status: 'down', error: String(dbR.reason) },
        redis,
      });
    }

    // 200 with status 'degraded' when Redis is down: the pod keeps serving,
    // and the degradation is still visible to anything reading this endpoint.
    return {
      status: redis.status === 'down' ? 'degraded' : 'ok',
      db: dbR.value,
      redis,
    };
  }

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
    this.logger.log('SIGTERM received — readiness now failing, draining');
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
