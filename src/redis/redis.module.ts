import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** @Global so every module can inject RedisService without importing this module. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
