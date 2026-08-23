import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReplayAdminService } from './replay-admin.service';
import { ReplaySessionStatus } from '../../generated/prisma/client';

@Controller('admin/shop/replay/sessions')
export class ReplayAdminController {
  constructor(private readonly replayAdmin: ReplayAdminService) {}

  @Get()
  list(@Query('productId') productId?: string, @Query('status') status?: ReplaySessionStatus, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.replayAdmin.list({
      productId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
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
