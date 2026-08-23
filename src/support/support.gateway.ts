import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { SupportConversationsService } from './support-conversations.service';
import { SupportSenderType } from '../../generated/prisma/client';
import {
  WS_RATE_LIMIT_COUNT,
  WS_RATE_LIMIT_WINDOW,
  MAX_MESSAGE_LENGTH,
} from './support.constants';

interface RateEntry {
  count: number;
  resetAt: number;
}

// In a multi-instance deployment replace with Redis-backed rate limiting.
const rateLimitMap = new Map<string, RateEntry>();

function checkRate(socketId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(socketId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(socketId, {
      count: 1,
      resetAt: now + WS_RATE_LIMIT_WINDOW,
    });
    return true;
  }
  if (entry.count >= WS_RATE_LIMIT_COUNT) return false;
  entry.count++;
  return true;
}

function sanitize(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

@WebSocketGateway({
  namespace: '/support',
  cors: {
    origin: (
      origin: string,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowed =
        process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? [];
      cb(null, !origin || allowed.includes(origin));
    },
    credentials: true,
  },
})
export class SupportGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(SupportGateway.name);

  constructor(
    private readonly convService: SupportConversationsService,
    private readonly jwtService: JwtService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async handleConnection(socket: Socket): Promise<void> {
    const { guestTicket, adminToken } = socket.handshake.auth as Record<
      string,
      string
    >;

    // ── Admin ────────────────────────────────────────────────────────────────
    if (adminToken) {
      try {
        const payload = this.jwtService.verify<{ sub: string; email: string }>(
          adminToken,
        );
        socket.data.adminId = payload.sub;
        socket.data.adminEmail = payload.email;
        await socket.join('admin');
        const unreadConvsCount = await this.convService.countConvsWithUnread();
        socket.emit('connected', { role: 'admin', unreadConvsCount });
        this.logger.log(`Admin ${payload.email} connected [${socket.id}]`);
      } catch {
        socket.emit('error', { code: 'AUTH_INVALID' });
        socket.disconnect(true);
      }
      return;
    }

    // ── Guest (signed short-lived ticket containing guestToken) ───────────────
    // Conversation is NOT created here — it is created lazily on first message:send.
    if (guestTicket) {
      try {
        const payload = this.jwtService.verify<{
          guestToken: string;
          purpose: string;
        }>(guestTicket);
        if (payload.purpose !== 'guest-ws') throw new Error('wrong purpose');

        const guestToken = payload.guestToken;
        const conversation = await this.convService.getByGuestToken(guestToken);

        socket.data.guestToken = guestToken;
        if (conversation) {
          socket.data.conversationId = conversation.id;
          await socket.join(`conv:${conversation.id}`);
          this.logger.log(
            `Guest connected conv=${conversation.id} [${socket.id}]`,
          );
        } else {
          this.logger.log(
            `Guest connected (no conversation yet) [${socket.id}]`,
          );
        }
        socket.emit('connected', {
          role: 'guest',
          conversationId: conversation?.id ?? null,
        });
      } catch {
        socket.emit('error', { code: 'AUTH_INVALID' });
        socket.disconnect(true);
      }
      return;
    }

    socket.emit('error', { code: 'AUTH_REQUIRED' });
    socket.disconnect(true);
  }

  handleDisconnect(socket: Socket): void {
    rateLimitMap.delete(socket.id);
    this.logger.debug(`Socket disconnected [${socket.id}]`);
  }

  // ── Guest: send message (with socket.io ACK) ───────────────────────────────

  @SubscribeMessage('message:send')
  async handleGuestMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      content: string;
      clientId?: string;
      guestName?: string;
      pageUrl?: string;
      checkoutProducts?: Array<{ title: string; url: string }>;
    },
  ): Promise<{
    ok: boolean;
    message?: unknown;
    clientId?: string;
    error?: string;
  }> {
    if (!socket.data.guestToken) return { ok: false, error: 'NOT_JOINED' };
    if (!checkRate(socket.id)) return { ok: false, error: 'RATE_LIMITED' };

    const content = sanitize(data?.content ?? '');
    if (!content) return { ok: false, error: 'EMPTY_MESSAGE' };

    // ── First message: create conversation lazily ──────────────────────────────
    if (!socket.data.conversationId) {
      try {
        const { conversation, message } =
          await this.convService.createConversationWithFirstMessage(
            socket.data.guestToken,
            data.guestName,
            content,
            data.clientId,
            data.pageUrl,
            data.checkoutProducts,
          );
        socket.data.conversationId = conversation.id;
        await socket.join(`conv:${conversation.id}`);

        this.server.to('admin').emit('conversation:new', conversation);
        this.server.to(`conv:${conversation.id}`).emit('message:new', message);
        this.server.to('admin').emit('conversation:update', {
          id: conversation.id,
          unreadAdminCount: conversation.unreadAdminCount,
          lastMessageAt: conversation.lastMessageAt,
          status: conversation.status,
        });
        return { ok: true, message, clientId: data.clientId };
      } catch {
        return { ok: false, error: 'SERVER_ERROR' };
      }
    }

    // ── Existing conversation ──────────────────────────────────────────────────
    try {
      const message = await this.convService.addMessage(
        socket.data.conversationId,
        SupportSenderType.guest,
        content,
        undefined,
        data.clientId,
      );

      const conv = await this.convService.getByGuestToken(
        socket.data.guestToken,
      );

      // Persist guest name if it is newly provided and not yet stored
      const nameUpdate: Record<string, unknown> = {};
      if (data.guestName && conv && !conv.guestName) {
        await this.convService.updateGuestName(
          socket.data.conversationId,
          data.guestName,
        );
        nameUpdate.guestName = data.guestName;
      }

      this.server
        .to(`conv:${socket.data.conversationId}`)
        .emit('message:new', message);
      this.server.to('admin').emit('conversation:update', {
        id: socket.data.conversationId,
        unreadAdminCount: conv?.unreadAdminCount ?? 1,
        lastMessageAt: message.createdAt,
        status: conv?.status,
        ...nameUpdate,
      });

      return { ok: true, message, clientId: data.clientId };
    } catch {
      return { ok: false, error: 'SERVER_ERROR' };
    }
  }

  // ── Admin: join conversation room ──────────────────────────────────────────

  @SubscribeMessage('admin:join:conversation')
  async handleAdminJoinConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!socket.data.adminId) return { ok: false, error: 'FORBIDDEN' };

    const { conversationId } = data ?? {};
    if (!conversationId) return { ok: false, error: 'MISSING_ID' };

    // Leave any other conversation room this admin was in
    for (const room of socket.rooms) {
      if (room.startsWith('conv:') && room !== `conv:${conversationId}`) {
        await socket.leave(room);
      }
    }

    await socket.join(`conv:${conversationId}`);
    socket.emit('admin:joined', { conversationId });

    // Joining counts as actively viewing — delegate to the unified handler
    await this.handleConversationActive(socket, { conversationId });

    return { ok: true };
  }

  // ── Admin: send message (with ACK) ─────────────────────────────────────────

  @SubscribeMessage('admin:message:send')
  async handleAdminMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { conversationId: string; content: string; clientId?: string },
  ): Promise<{
    ok: boolean;
    message?: unknown;
    clientId?: string;
    error?: string;
  }> {
    if (!socket.data.adminId) return { ok: false, error: 'FORBIDDEN' };
    if (!checkRate(socket.id)) return { ok: false, error: 'RATE_LIMITED' };

    const content = sanitize(data?.content ?? '');
    if (!content) return { ok: false, error: 'EMPTY_MESSAGE' };

    try {
      const message = await this.convService.addMessage(
        data.conversationId,
        SupportSenderType.admin,
        content,
        socket.data.adminId,
        data.clientId,
      );

      const { conversation } = await this.convService.getByIdForAdmin(
        data.conversationId,
      );

      this.server
        .to(`conv:${data.conversationId}`)
        .emit('message:new', message);
      this.server.to('admin').emit('conversation:update', {
        id: data.conversationId,
        unreadGuestCount: conversation.unreadGuestCount,
        lastMessageAt: message.createdAt,
        status: conversation.status,
      });

      return { ok: true, message, clientId: data.clientId };
    } catch {
      return { ok: false, error: 'SERVER_ERROR' };
    }
  }

  // ── Unified passive seen trigger (guest + admin) ───────────────────────────
  //
  // Emitted by the client whenever:
  //   - the chat widget opens (guest)
  //   - a conversation is selected / tab regains focus (admin)
  //   - new messages arrive while the chat is already visible (either side)
  //
  // Idempotent: markMessagesRead only touches rows WHERE readAt IS NULL.

  @SubscribeMessage('conversation:active')
  async handleConversationActive(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId?: string },
  ): Promise<void> {
    let conversationId: string | undefined;
    let readerType: 'admin' | 'guest';

    if (socket.data.adminId) {
      conversationId = data?.conversationId;
      readerType = 'admin';
    } else if (socket.data.conversationId) {
      conversationId = socket.data.conversationId;
      readerType = 'guest';
    } else {
      return;
    }

    if (!conversationId) return;

    const read = await this.convService.markMessagesRead(
      conversationId,
      readerType,
    );
    if (read.messageIds.length === 0) return;

    const payload = {
      conversationId,
      seenBy: readerType,
      seenAt: read.seenAt.toISOString(),
      messageIds: read.messageIds,
    };

    // Participants in the chat room see the indicator immediately
    this.server.to(`conv:${conversationId}`).emit('messages:seen', payload);
    // All admin connections receive it too — covers admins in list view only
    this.server.to('admin').emit('messages:seen', payload);

    // Keep unread counters in sync
    this.server.to('admin').emit('conversation:update', {
      id: conversationId,
      ...(readerType === 'admin'
        ? { unreadAdminCount: 0 }
        : { unreadGuestCount: 0 }),
    });
  }

  // ── Guest: mark admin messages as seen (kept for compat, delegates above) ──

  @SubscribeMessage('guest:read')
  async handleGuestRead(@ConnectedSocket() socket: Socket): Promise<void> {
    if (!socket.data.conversationId) return;
    await this.handleConversationActive(socket, {});
  }

  // ── Guest: sync missed messages after reconnect ────────────────────────────

  @SubscribeMessage('guest:sync')
  async handleGuestSync(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { since?: string },
  ): Promise<{ ok: boolean; messages?: unknown[] }> {
    if (!socket.data.guestToken) return { ok: false };

    const { messages } = await this.convService.bootstrap(
      socket.data.guestToken,
      undefined,
      data?.since,
    );

    return { ok: true, messages };
  }

  // ── Typing indicator ──────────────────────────────────────────────────────

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { isTyping: boolean; conversationId?: string },
  ): void {
    const isTyping = !!data?.isTyping;

    if (socket.data.adminId) {
      const cid = data?.conversationId;
      if (!cid) return;
      socket.to(`conv:${cid}`).emit('user:typing', {
        conversationId: cid,
        senderType: 'admin',
        isTyping,
      });
    } else if (socket.data.conversationId) {
      socket.to('admin').emit('user:typing', {
        conversationId: socket.data.conversationId,
        senderType: 'guest',
        isTyping,
      });
    }
  }

  // ── Utility (REST layer pushes updates via this) ───────────────────────────

  emitConversationUpdate(
    conversationId: string,
    payload: Record<string, unknown>,
  ): void {
    this.server
      ?.to('admin')
      .emit('conversation:update', { id: conversationId, ...payload });
  }
}
