import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/public.decorator';
import { RateLimit } from '../common/throttling/rate-limit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { OrderAccessService } from '../orders/order-access.service';
import { SupportConversationsService } from './support-conversations.service';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  SupportAttachmentsService,
} from './support-attachments.service';
import { SupportGateway } from './support.gateway';
import { GUEST_WS_TICKET_TTL } from './support.constants';
import { SupportSenderType } from '../../generated/prisma/client';

/** Header the BFF replays the customer's order grant on. */
const GRANT_HEADER = 'x-order-grant';

/**
 * The customer's half of an order conversation.
 *
 * Deliberately thin: it opens the thread's history and mints the websocket
 * ticket, and nothing else. Messages travel over the existing support socket,
 * so they inherit its rate limiting, its delivery acknowledgements, its
 * broadcast to the admin inbox and its unread bookkeeping — none of which is
 * worth reimplementing over HTTP.
 *
 * Access is whatever opened the tracking page: any valid grant for this order,
 * from the emailed link or from the order number and the buyer's address. The
 * conversation is a tab on that page and opens with it, with no extra step.
 *
 * That is a deliberate product decision, taken knowing that order numbers are
 * sequential (`ORD-000123`) and an email address is not a secret — so the pair
 * is guessable, and someone who guesses it can write to the shop as the
 * customer. The stronger `full` level still exists and is still recorded on
 * every grant, so gating this on it later is a one-line change here.
 */
@Public()
@Controller('shop/orders/:orderNumber/conversation')
export class SupportOrderController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessService,
    private readonly conversations: SupportConversationsService,
    private readonly attachments: SupportAttachmentsService,
    private readonly gateway: SupportGateway,
    private readonly jwt: JwtService,
  ) {}

  /**
   * The order id this grant proves access to.
   *
   * 404 rather than 403 for every failure, matching the tracking endpoints:
   * order numbers are sequential, and an error that distinguishes "wrong
   * credential" from "no such order" is an enumeration oracle.
   */
  private orderIdFor(orderNumber: string, rawGrant?: string): string {
    const grant = this.access.verifyGrant(rawGrant);
    // Either level opens the thread; what is still enforced is that the grant
    // is real, unexpired, and for *this* order.
    if (!grant || grant.orderNumber !== orderNumber) {
      throw new NotFoundException('Order not found');
    }
    return grant.orderId;
  }

  /**
   * The thread so far.
   *
   * An order nobody has written about has no conversation row, which is not an
   * error — it is the normal state, and the answer is an empty thread. The row
   * is created by the first message, so opening the tracking page never puts
   * an empty conversation in the support inbox.
   */
  @Get()
  @RateLimit(60, 15)
  async history(
    @Param('orderNumber') orderNumber: string,
    @Headers(GRANT_HEADER) rawGrant?: string,
  ) {
    const orderId = this.orderIdFor(orderNumber, rawGrant);
    const conversation = await this.conversations.getByOrderId(orderId);
    if (!conversation) {
      return { conversationId: null, status: null, messages: [] };
    }

    const messages = await this.conversations.messagesFor(conversation.id);
    return {
      conversationId: conversation.id,
      status: conversation.status,
      unreadGuestCount: conversation.unreadGuestCount,
      messages,
    };
  }

  /**
   * A message carrying images.
   *
   * The upload and the message are one request on purpose. The obvious
   * alternative — upload, hand the client a storage key, let it send that key
   * back on the socket — makes the client the author of a path this server
   * then signs and serves, and a client that returned `invoices/2026.pdf`
   * would be handed a signed URL for it. Here no key ever leaves the server.
   *
   * Rate-limited harder than text: the socket's own limiter does not see HTTP,
   * and this path decodes and re-encodes every image it accepts.
   */
  @Post('attachments')
  @HttpCode(201)
  @RateLimit(20, 15)
  @UseInterceptors(
    FilesInterceptor('images', ATTACHMENT_MAX_FILES, {
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: ATTACHMENT_MAX_FILES },
    }),
  )
  async sendWithAttachments(
    @Param('orderNumber') orderNumber: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body('content') content = '',
    @Headers(GRANT_HEADER) rawGrant?: string,
  ) {
    const orderId = this.orderIdFor(orderNumber, rawGrant);
    if (files.length === 0) throw new NotFoundException('Nothing to send');

    const stored = await this.attachments.upload(files);
    const existing = await this.conversations.getByOrderId(orderId);

    if (existing) {
      const message = await this.conversations.addMessage(
        existing.id,
        SupportSenderType.guest,
        content,
        undefined,
        undefined,
        stored,
      );
      const conv = await this.conversations.getByIdOrNull(existing.id);
      const [withUrls] = await this.conversations.withAttachmentUrls([message]);
      if (conv) this.gateway.publishMessage(conv, withUrls);
      return withUrls;
    }

    const { conversation, message } =
      await this.conversations.createOrderConversationWithFirstMessage(
        orderId,
        undefined,
        SupportSenderType.guest,
        content,
        undefined,
        undefined,
        stored,
      );
    const [withUrls] = await this.conversations.withAttachmentUrls([message]);
    this.gateway.publishMessage(conversation, withUrls, true);
    return withUrls;
  }

  /**
   * A short-lived ticket for the support websocket.
   *
   * It names the *order*, not the conversation's guestToken: that token is an
   * internal join key, and a customer who held it could reconnect to the
   * thread forever without ever re-proving the order is theirs. The ticket
   * expires in minutes, so access is only ever as current as the grant that
   * bought it.
   */
  @Post('ws-ticket')
  @HttpCode(200)
  @RateLimit(60, 15)
  async wsTicket(
    @Param('orderNumber') orderNumber: string,
    @Headers(GRANT_HEADER) rawGrant?: string,
  ) {
    const orderId = this.orderIdFor(orderNumber, rawGrant);

    // The grant outlives the order by design (30 days), so confirm the order
    // is still there rather than handing out a ticket to a deleted row.
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const ticket = this.jwt.sign(
      { orderId, purpose: 'guest-ws' },
      { expiresIn: GUEST_WS_TICKET_TTL },
    );
    return { ticket };
  }
}
