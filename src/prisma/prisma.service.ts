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
      adapter: new PrismaPg(url),
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
