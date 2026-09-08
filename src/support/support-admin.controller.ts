import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  HttpCode,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SupportConversationsService } from './support-conversations.service';
import {
  SupportNotificationService,
  SupportNotificationSettings,
} from './support-notification.service';
import { SupportGateway } from './support.gateway';
import {
  AssignDto,
  AssignSchema,
  StatusDto,
  StatusSchema,
  UpdateSettingsDto,
  UpdateSettingsSchema,
} from './dto/send-message.dto';
import { SupportConversationStatus } from '../../generated/prisma/client';

function adminId(req: Request): string | undefined {
  return (req.user as { id?: string })?.id;
}

@Controller('support/admin')
export class SupportAdminController {
  constructor(
    private readonly convService: SupportConversationsService,
    private readonly notifService: SupportNotificationService,
    private readonly gateway: SupportGateway,
  ) {}

  @Get('conversations')
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.convService.listForAdmin({
      status,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('conversations/unread-count')
  async unreadCount() {
    return { count: await this.convService.getUnreadCount() };
  }

  @Get('analytics')
  analytics() {
    return this.convService.getAnalytics();
  }

  @Get('conversations/:id')
  getOne(@Param('id') id: string) {
    return this.convService.getByIdForAdmin(id);
  }

  @Patch('conversations/:id/assign')
  async assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AssignSchema)) dto: AssignDto,
    @Req() req: Request,
  ) {
    const conv = await this.convService.assignAdmin(
      id,
      dto.adminId,
      adminId(req),
    );
    this.gateway.emitConversationUpdate(id, {
      assignedAdminId: conv.assignedAdminId,
    });
    return conv;
  }

  @Patch('conversations/:id/status')
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StatusSchema)) dto: StatusDto,
    @Req() req: Request,
  ) {
    const conv = await this.convService.setStatus(
      id,
      dto.status as SupportConversationStatus,
      adminId(req),
      dto.note,
    );
    this.gateway.emitConversationUpdate(id, { status: conv.status });
    return conv;
  }

  @Patch('conversations/:id/read')
  @HttpCode(204)
  async markRead(@Param('id') id: string) {
    const read = await this.convService.markMessagesRead(id, 'admin');
    if (read.messageIds.length > 0) {
      this.gateway.emitConversationUpdate(id, { unreadAdminCount: 0 });
    }
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @Req() req: Request) {
    await this.convService.deleteConversation(id, adminId(req));
    this.gateway.emitConversationUpdate(id, { deleted: true });
  }

  @Get('settings')
  getSettings() {
    return this.withReach(this.notifService.getSettings());
  }

  @Patch('settings')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateSettingsSchema)) dto: UpdateSettingsDto,
  ) {
    return this.withReach(this.notifService.updateSettings(dto));
  }

  /**
   * Adds how many numbers a guest message would actually reach, so the settings
   * modal can say "on, but nobody is listening" instead of leaving the admin to
   * discover it from a support_notification_logs row nothing surfaces.
   */
  private async withReach(
    settings: Promise<SupportNotificationSettings>,
  ): Promise<SupportNotificationSettings & { resolvedPhoneCount: number }> {
    // Sequential on purpose: on the PATCH path the write has to land before
    // the reach is counted, or the modal reports the pre-save state.
    const value = await settings;
    const resolved = await this.notifService.resolvePhones();
    return { ...value, resolvedPhoneCount: resolved.length };
  }
}
