import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CommerceNotificationService } from './commerce-notification.service';
import { ADMIN_NOTIF_EVENTS } from './commerce-notification.constants';

const SettingsPatchSchema = z
  .object({
    smsEnabled: z.boolean(),
    smsPhones: z.array(z.string().min(1).max(32)).max(20),
    emailEnabled: z.boolean(),
    emailAddresses: z.array(z.string().email()).max(20),
    events: z.array(z.enum(ADMIN_NOTIF_EVENTS)),
  })
  .partial();

@Controller('admin/shop/notifications')
export class CommerceNotificationAdminController {
  constructor(private readonly notifications: CommerceNotificationService) {}

  @Get('settings')
  getSettings() {
    return this.notifications.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ZodValidationPipe(SettingsPatchSchema))
    dto: z.infer<typeof SettingsPatchSchema>,
  ) {
    return this.notifications.updateSettings(dto);
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
