import { Controller, Get, Query } from '@nestjs/common';
import { CommerceEventBus } from './commerce-event-bus.service';

/**
 * Generic admin activity feed over every commerce event ever emitted.
 * Once the customers domain exists, the customer-detail page filters this
 * by `entityId` to show a per-customer timeline.
 */
@Controller('admin/shop/events')
export class CommerceEventLogAdminController {
  constructor(private readonly eventBus: CommerceEventBus) {}

  @Get()
  list(
    @Query('entityId') entityId?: string,
    @Query('eventName') eventName?: string,
    @Query('status') status?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    return this.eventBus.queryLog({ entityId, eventName, status, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
  }
}
