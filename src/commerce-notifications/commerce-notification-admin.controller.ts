import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { CommerceNotificationService, AdminNotifEvent } from './commerce-notification.service';

@Controller('admin/shop/notifications')
export class CommerceNotificationAdminController {
  constructor(private readonly notifications: CommerceNotificationService) {}

  @Get('settings')
  getSettings() {
    return this.notifications.getSettings();
  }

  @Put('settings')
  updateSettings(@Body('events') events: AdminNotifEvent[]) {
    return this.notifications.updateSettings(events ?? []);
  }

  @Get('logs')
  getLogs(@Query('channel') channel?: string, @Query('event') event?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.notifications.getLogs({
      channel,
      event,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
