import { Controller, Get, Param, Query } from '@nestjs/common';
import { resolveWindow, intParam } from '../analytics/analytics-filters';
import { ReplayAdminService } from './replay-admin.service';
import { ReplaySessionStatus } from '../../generated/prisma/client';

@Controller('admin/shop/replay/sessions')
export class ReplayAdminController {
  constructor(private readonly replayAdmin: ReplayAdminService) {}

  @Get()
  list(
    @Query('productId') productId?: string,
    @Query('status') status?: ReplaySessionStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.replayAdmin.list(resolveWindow({ days, startDate, endDate }), {
      productId,
      status,
      limit: intParam(limit),
      offset: intParam(offset),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.replayAdmin.findOne(id);
  }

  @Get(':id/events')
  getEvents(@Param('id') id: string) {
    return this.replayAdmin.getSessionEvents(id);
  }
}
