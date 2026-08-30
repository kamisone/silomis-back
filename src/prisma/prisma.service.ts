import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { buildDatabaseUrl } from './database-url';

/**
 * Single shared Prisma connection for the whole app. Injected wherever a
 * module needs database access — never instantiate PrismaClient anywhere
 * else.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = buildDatabaseUrl();
    if (!url) throw new Error('Missing database configuration: set either DATABASE_URL or PRISMA_HOST/PRISMA_PORT/PRISMA_USERNAME/PRISMA_PASSWORD/PRISMA_DATABASE');

    super({
      // Pooling here is node-postgres's, not Prisma's engine pool, so it is
      // configured on the PoolConfig — a `connection_limit` query param in the
      // URL would be silently ignored by the driver adapter.
      //
      // The pool is per *process*, and the HPA runs up to maxReplicas of them.
      // Left at node-postgres's default of 10, ten replicas can ask for 100
      // connections and exhaust Postgres's default max_connections=100, which
      // surfaces as "too many clients already" under exactly the traffic that
      // triggered the scale-up. Budget: maxReplicas x max + superuser headroom
      // must stay under the server's max_connections (see the -c
      // max_connections argument in db-deployment.yaml).
      adapter: new PrismaPg({
        connectionString: url,
        max: Number(process.env.PG_POOL_MAX ?? 8),
        // Hand idle connections back so a pod that scaled up during a spike
        // isn't still holding its full pool an hour later.
        idleTimeoutMillis: Number(
          process.env.PG_POOL_IDLE_TIMEOUT_MS ?? 30_000,
        ),
        // Fail fast when the pool is saturated instead of queueing forever.
        connectionTimeoutMillis: Number(
          process.env.PG_POOL_CONNECT_TIMEOUT_MS ?? 10_000,
        ),
      }),
      log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['warn'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
