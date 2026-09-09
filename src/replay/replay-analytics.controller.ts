import { Controller, Get, Query } from '@nestjs/common';
import { resolveWindow } from '../analytics/analytics-filters';
import { ReplayAdminService } from './replay-admin.service';

/**
 * Admin-only — protected by the global JwtAuthGuard, same as every other
 * controller under admin/shop/analytics/*. A distinct top-level path (not
 * nested under replay/sessions/:id) so it can never collide with that
 * controller's :id route regardless of declaration order.
 */
@Controller('admin/shop/analytics/replay')
export class ReplayAnalyticsController {
  constructor(private readonly replayAdmin: ReplayAdminService) {}

  @Get('unread-counts')
  getUnreadCounts(
    @Query('productIds') productIds: string,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('scope') scope?: string,
  ) {
    return this.replayAdmin.getUnreadCounts(
      productIds ? productIds.split(',').filter(Boolean) : [],
      resolveWindow({ days, startDate, endDate }),
      // Omitted means every phase — the badge only narrows when the caller says which tab it is on.
      scope === 'test' || scope === 'live' ? scope : undefined,
    );
  }
}
