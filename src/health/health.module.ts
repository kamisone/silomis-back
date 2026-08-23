import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '../redis/redis.module';
import { DLQ_QUEUE } from '../dlq/dlq.constants';
import { HealthController } from './health.controller';

@Module({
  imports: [RedisModule, BullModule.registerQueue({ name: DLQ_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
