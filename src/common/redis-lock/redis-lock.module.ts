import { Global, Module } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service';

/** @Global so any module with a @Cron can inject the lock without wiring imports. */
@Global()
@Module({
  providers: [RedisLockService],
  exports: [RedisLockService],
})
export class RedisLockModule {}
