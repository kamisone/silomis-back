import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SupportConversationsService } from './support-conversations.service';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  SupportAttachmentsService,
} from './support-attachments.service';
import { SupportSenderType } from '../../generated/prisma/client';
import { SupportNotificationService } from './support-notification.service';
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
    private readonly attachments: SupportAttachmentsService,
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

  /**
   * Orders with unread customer messages — the Orders menu badge, and the
   * markers in the orders list.
   *
   * `ids` narrows it to one page of the list; without it the answer is just
   * the total, which is what the sidebar needs.
   */
  @Get('orders/unread')
  async ordersUnread(@Query('ids') ids?: string) {
    const orderIds = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const [count, byOrder] = await Promise.all([
      this.convService.countOrdersWithUnread(),
      this.convService.unreadByOrderId(orderIds),
    ]);
    return { count, byOrder };
  }

  /**
   * The shop's reply, carrying images.
   *
   * Mirrors the customer's endpoint, including why it is one request: no
   * storage key ever reaches a client, so none can be sent back.
   */
  @Post('orders/:orderId/attachments')
  @HttpCode(201)
  @UseInterceptors(
    FilesInterceptor('images', ATTACHMENT_MAX_FILES, {
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: ATTACHMENT_MAX_FILES },
    }),
  )
  async sendOrderAttachments(
    @Param('orderId') orderId: string,
    @Req() req: { user?: { id?: string } },
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body('content') content = '',
  ) {
    if (files.length === 0) throw new NotFoundException('Nothing to send');
    const stored = await this.attachments.upload(files);
    const adminId = req.user?.id;

    const existing = await this.convService.getByOrderId(orderId);
    if (existing) {
      const message = await this.convService.addMessage(
        existing.id,
        SupportSenderType.admin,
        content,
        adminId,
        undefined,
        stored,
      );
      const conv = await this.convService.getByIdOrNull(existing.id);
      const [withUrls] = await this.convService.withAttachmentUrls([message]);
      if (conv) this.gateway.publishMessage(conv, withUrls);
      return withUrls;
    }

    const { conversation, message } =
      await this.convService.createOrderConversationWithFirstMessage(
        orderId,
        undefined,
        SupportSenderType.admin,
        content,
        adminId,
        undefined,
        stored,
      );
    const [withUrls] = await this.convService.withAttachmentUrls([message]);
    this.gateway.publishMessage(conversation, withUrls, true);
    return withUrls;
  }

  /**
   * An order's thread, for the Messages tab on the order page.
   *
   * Null when nobody has written yet — the normal state, not an error. The
   * thread opens on the first message from either side.
   */
  @Get('orders/:orderId/conversation')
  async orderConversation(@Param('orderId') orderId: string) {
    const conversation = await this.convService.getByOrderId(orderId);
    if (!conversation) {
      return { conversationId: null, status: null, messages: [] };
    }
    const messages = await this.convService.messagesFor(conversation.id);
    return {
      conversationId: conversation.id,
      status: conversation.status,
      unreadAdminCount: conversation.unreadAdminCount,
      messages,
    };
  }

  @Get('settings')
  getSettings() {
    return this.notifService.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateSettingsSchema)) dto: UpdateSettingsDto,
  ) {
    return this.notifService.updateSettings(dto);
  }
}
