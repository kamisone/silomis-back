import { Global, Module } from '@nestjs/common';
import { CommerceEventBus } from './commerce-event-bus.service';
import { CommerceEventLogAdminController } from './commerce-event-log-admin.controller';

/**
 * @Global so every commerce domain module (inventory, cart, orders,
 * payments, ...) can inject CommerceEventBus without an explicit import —
 * same pattern as RedisModule/AssetUrlModule.
 */
@Global()
@Module({
  controllers: [CommerceEventLogAdminController],
  providers: [CommerceEventBus],
  exports: [CommerceEventBus],
})
export class CommerceEventsModule {}
