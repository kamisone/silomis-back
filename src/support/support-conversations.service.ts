import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  SupportConversation,
  SupportConversationStatus,
  SupportMessage,
  SupportSenderType,
  AuditAction,
} from '../../generated/prisma/client';
import { SUPPORT_QUEUE, MAX_MESSAGE_LENGTH } from './support.constants';

function sanitize(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

// High enough that a real cart's line items are never trimmed — this only
// exists to bound a hostile/malformed websocket payload's storage size.
const MAX_CHECKOUT_PRODUCTS = 50;

/**
 * Client-supplied over the websocket, same trust level as `pageUrl` (also
 * unvalidated client input rendered as a link in the admin panel) — just
 * capped in shape/size so a malformed or hostile payload can't bloat the row.
 */
function sanitizeCheckoutProducts(
  raw: Array<{ title: string; url: string }> | undefined,
): Array<{ title: string; url: string }> | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const cleaned = raw
    .filter(
      (p): p is { title: string; url: string } =>
        !!p && typeof p.title === 'string' && typeof p.url === 'string',
    )
    .map((p) => ({
      title: sanitize(p.title).slice(0, 200),
      url: p.url.trim().slice(0, 500),
    }))
    .filter((p) => p.title && p.url)
    .slice(0, MAX_CHECKOUT_PRODUCTS);
  return cleaned.length ? cleaned : null;
}

export interface ReadResult {
  messageIds: string[];
  seenAt: Date;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface SupportAnalytics {
  totalConversations: number;
  openConversations: number;
  closedToday: number;
  unresolvedCount: number; // open for > 24h
  avgFirstResponseMs: number | null;
  messageVolumeByDay: { date: string; count: number }[];
  peakHours: { hour: number; count: number }[];
}

type MessageWithClientId = SupportMessage & { clientId?: string };

@Injectable()
export class SupportConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SUPPORT_QUEUE) private readonly notifQueue: Queue,
  ) {}

  // ── Guest bootstrap ────────────────────────────────────────────────────────

  // Returns existing conversation + history. Never creates a new conversation.
  async bootstrap(
    guestToken: string,
    guestName?: string,
    since?: string,
  ): Promise<{
    conversation: SupportConversation | null;
    messages: SupportMessage[];
  }> {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { guestToken },
    });
    if (!conversation) return { conversation: null, messages: [] };

    let updated = conversation;
    if (guestName && !conversation.guestName) {
      updated = await this.prisma.supportConversation.update({
        where: { id: conversation.id },
        data: { guestName },
      });
    }

    const messages = await this.prisma.supportMessage.findMany({
      where: {
        conversationId: updated.id,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return { conversation: updated, messages };
  }

  // Creates a new conversation and its first message atomically.
  // Called by the WebSocket gateway on the guest's first message:send event.
  async createConversationWithFirstMessage(
    guestToken: string,
    guestName: string | undefined,
    content: string,
    clientId?: string,
    pageUrl?: string,
    checkoutProducts?: Array<{ title: string; url: string }>,
  ): Promise<{
    conversation: SupportConversation;
    message: MessageWithClientId;
  }> {
    const conversation = await this.prisma.supportConversation.create({
      data: {
        guestToken,
        guestName: guestName ?? null,
        pageUrl: pageUrl ?? null,
        checkoutProducts: sanitizeCheckoutProducts(
          checkoutProducts,
        ) as Prisma.InputJsonValue,
        status: SupportConversationStatus.waiting_admin,
      },
    });
    const message = await this.addMessage(
      conversation.id,
      SupportSenderType.guest,
      content,
      undefined,
      clientId,
    );
    const updated = await this.prisma.supportConversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    return { conversation: updated, message };
  }

  async countConvsWithUnread(): Promise<number> {
    return this.prisma.supportConversation.count({
      where: { unreadAdminCount: { gt: 0 } },
    });
  }

  async updateGuestName(
    conversationId: string,
    guestName: string,
  ): Promise<void> {
    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: { guestName },
    });
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  async addMessage(
    conversationId: string,
    senderType: SupportSenderType,
    rawContent: string,
    senderId?: string,
    clientId?: string,
  ): Promise<MessageWithClientId> {
    const content = sanitize(rawContent);
    const message = await this.prisma.supportMessage.create({
      data: { conversationId, senderType, content, senderId: senderId ?? null },
    });

    const now = new Date();

    if (senderType === SupportSenderType.guest) {
      const conv = await this.prisma.supportConversation.findUnique({
        where: { id: conversationId },
      });
      const wasClosedOrArchived =
        conv?.status === SupportConversationStatus.closed ||
        conv?.status === SupportConversationStatus.archived;

      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          unreadAdminCount: { increment: 1 },
          status: SupportConversationStatus.waiting_admin,
          // Auto-reopen: clear resolvedAt when a closed conversation gets a new guest message
          ...(wasClosedOrArchived
            ? { resolvedAt: null, archivedAt: null }
            : {}),
        },
      });

      await this.notifQueue.add(
        'notify-admin',
        { conversationId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      );
    } else if (senderType === SupportSenderType.admin) {
      const conv = await this.prisma.supportConversation.findUnique({
        where: { id: conversationId },
      });
      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          unreadGuestCount: { increment: 1 },
          status: SupportConversationStatus.waiting_guest,
          // Record first admin response time for analytics
          ...(conv && !conv.firstResponseAt ? { firstResponseAt: now } : {}),
        },
      });
    }

    return { ...message, ...(clientId ? { clientId } : {}) };
  }

  // ── Seen / read system ─────────────────────────────────────────────────────

  async markMessagesRead(
    conversationId: string,
    readerType: 'admin' | 'guest',
  ): Promise<ReadResult> {
    const senderTypeToMark =
      readerType === 'admin'
        ? SupportSenderType.guest
        : SupportSenderType.admin;
    const seenAt = new Date();

    const unread = await this.prisma.supportMessage.findMany({
      where: { conversationId, senderType: senderTypeToMark, readAt: null },
      select: { id: true },
    });
    const messageIds = unread.map((m) => m.id);

    if (messageIds.length > 0) {
      await this.prisma.supportMessage.updateMany({
        where: { id: { in: messageIds } },
        data: { readAt: seenAt },
      });
    }

    if (readerType === 'admin') {
      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: { unreadAdminCount: 0 },
      });
    } else {
      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: { unreadGuestCount: 0 },
      });
    }

    return { messageIds, seenAt };
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async listForAdmin(filters: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ conversations: SupportConversation[]; total: number }> {
    const where: Prisma.SupportConversationWhereInput = {};

    // Exclude archived from default listing
    if (filters.status === 'archived') {
      where.archivedAt = { not: null };
    } else {
      where.archivedAt = null;
      if (filters.status && filters.status !== 'all') {
        where.status = filters.status as SupportConversationStatus;
      }
    }

    if (filters.search) {
      where.OR = [
        { guestToken: { contains: filters.search, mode: 'insensitive' } },
        { guestName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = filters.offset ?? 0;

    const [conversations, total] = await Promise.all([
      this.prisma.supportConversation.findMany({
        where,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        skip: offset,
        take: limit,
      }),
      this.prisma.supportConversation.count({ where }),
    ]);

    return { conversations, total };
  }

  async getByIdForAdmin(id: string): Promise<{
    conversation: SupportConversation;
    messages: SupportMessage[];
  }> {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.supportMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    return { conversation, messages };
  }

  async assignAdmin(
    id: string,
    adminId: string | null,
    actorAdminId?: string,
  ): Promise<SupportConversation> {
    const conv = await this.prisma.supportConversation.findUnique({
      where: { id },
    });
    if (!conv) throw new NotFoundException();
    await this.prisma.supportConversation.update({
      where: { id },
      data: { assignedAdminId: adminId },
    });
    await this.audit(
      id,
      'assigned',
      actorAdminId,
      { assignedAdminId: conv.assignedAdminId },
      { assignedAdminId: adminId },
    );
    return this.prisma.supportConversation.findUniqueOrThrow({ where: { id } });
  }

  async setStatus(
    id: string,
    status: SupportConversationStatus,
    actorAdminId?: string,
    note?: string,
  ): Promise<SupportConversation> {
    const conv = await this.prisma.supportConversation.findUnique({
      where: { id },
    });
    if (!conv) throw new NotFoundException();

    const updates: Prisma.SupportConversationUpdateInput = { status };

    if (
      status === SupportConversationStatus.closed ||
      status === SupportConversationStatus.archived
    ) {
      updates.resolvedAt = new Date();
      if (status === SupportConversationStatus.archived)
        updates.archivedAt = new Date();
    } else {
      // Reopening
      updates.resolvedAt = null;
    }

    await this.prisma.supportConversation.update({
      where: { id },
      data: updates,
    });

    const action: AuditAction =
      status === 'archived' ? 'conversation_archived' : 'status_changed';
    await this.audit(
      id,
      action,
      actorAdminId,
      { status: conv.status },
      { status },
      note,
    );

    return this.prisma.supportConversation.findUniqueOrThrow({ where: { id } });
  }

  async deleteConversation(id: string, actorAdminId?: string): Promise<void> {
    const conv = await this.prisma.supportConversation.findUnique({
      where: { id },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.audit(
      id,
      'conversation_deleted',
      actorAdminId,
      { guestToken: conv.guestToken, status: conv.status },
      null,
    );
    await this.prisma.supportConversation.delete({ where: { id } });
  }

  async autoCloseConversations(olderThanHours: number): Promise<string[]> {
    const threshold = new Date(Date.now() - olderThanHours * 3_600_000);

    const staleStatuses: SupportConversationStatus[] = [
      SupportConversationStatus.open,
      SupportConversationStatus.waiting_admin,
      SupportConversationStatus.waiting_guest,
    ];

    const convs = await this.prisma.supportConversation.findMany({
      where: {
        status: { in: staleStatuses },
        archivedAt: null,
        OR: [
          { lastMessageAt: { lt: threshold } },
          { lastMessageAt: null, createdAt: { lt: threshold } },
        ],
      },
    });

    const closedIds: string[] = [];

    for (const conv of convs) {
      await this.prisma.supportConversation.update({
        where: { id: conv.id },
        data: {
          status: SupportConversationStatus.closed,
          resolvedAt: new Date(),
        },
      });
      await this.prisma.supportMessage.create({
        data: {
          conversationId: conv.id,
          senderType: SupportSenderType.system,
          content: 'auto_closed', // translated by the frontend
        },
      });
      await this.audit(
        conv.id,
        'auto_closed',
        null,
        { status: conv.status },
        { status: SupportConversationStatus.closed },
      );
      closedIds.push(conv.id);
    }

    return closedIds;
  }

  // ── Counts ─────────────────────────────────────────────────────────────────

  async getUnreadCount(): Promise<number> {
    const result = await this.prisma.supportConversation.aggregate({
      where: { archivedAt: null },
      _sum: { unreadAdminCount: true },
    });
    return result._sum.unreadAdminCount ?? 0;
  }

  async getByGuestToken(
    guestToken: string,
  ): Promise<SupportConversation | null> {
    return this.prisma.supportConversation.findUnique({
      where: { guestToken },
    });
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  async getAnalytics(): Promise<SupportAnalytics> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const dayAgo = new Date(Date.now() - 86_400_000);

    const [
      total,
      open,
      closedToday,
      unresolved,
      avgFirstResp,
      volumeRaw,
      peakRaw,
    ] = await Promise.all([
      this.prisma.supportConversation.count(),
      this.prisma.supportConversation.count({
        where: {
          archivedAt: null,
          status: {
            in: [
              SupportConversationStatus.open,
              SupportConversationStatus.waiting_admin,
              SupportConversationStatus.waiting_guest,
            ],
          },
        },
      }),
      this.prisma.supportConversation.count({
        where: {
          status: SupportConversationStatus.closed,
          resolvedAt: { gte: startOfToday },
        },
      }),
      this.prisma.supportConversation.count({
        where: {
          status: {
            notIn: [
              SupportConversationStatus.closed,
              SupportConversationStatus.archived,
            ],
          },
          createdAt: { lt: dayAgo },
        },
      }),
      this.prisma.$queryRaw<Array<{ avgMs: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) * 1000) AS "avgMs"
        FROM support_conversations WHERE "firstResponseAt" IS NOT NULL
      `,
      this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS date, COUNT(*)::bigint AS count
        FROM support_messages WHERE "createdAt" > NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR("createdAt"::date, 'YYYY-MM-DD') ORDER BY date ASC
      `,
      this.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::bigint AS count
        FROM support_messages WHERE "senderType" = 'guest' AND "createdAt" > NOW() - INTERVAL '30 days'
        GROUP BY EXTRACT(HOUR FROM "createdAt") ORDER BY hour ASC
      `,
    ]);

    return {
      totalConversations: total,
      openConversations: open,
      closedToday,
      unresolvedCount: unresolved,
      avgFirstResponseMs:
        avgFirstResp[0]?.avgMs != null
          ? Math.round(Number(avgFirstResp[0].avgMs))
          : null,
      messageVolumeByDay: volumeRaw.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
      peakHours: peakRaw.map((r) => ({
        hour: Number(r.hour),
        count: Number(r.count),
      })),
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async audit(
    conversationId: string,
    action: AuditAction,
    adminId: string | null | undefined,
    previousValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
    note?: string,
  ): Promise<void> {
    await this.prisma.supportAuditLog.create({
      data: {
        conversationId,
        adminId: adminId ?? null,
        action,
        previousValue: (previousValue ?? undefined) as Prisma.InputJsonValue,
        newValue: (newValue ?? undefined) as Prisma.InputJsonValue,
        note: note ?? null,
      },
    });
  }
}
