import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNewsletterSubscriberDto } from './dto/create-newsletter-subscriber.dto';
import {
  BulkSubscriberActionDto,
  CreateSubscriberAdminDto,
  UpdateSubscriberDto,
} from './dto/subscriber.dto';
import {
  NewsletterSubscriberStatus,
  Prisma,
} from '../../generated/prisma/client';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';

export interface AdminListFilters {
  search?: string;
  status?: NewsletterSubscriberStatus;
  locale?: string;
  source?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async subscribe(
    dto: CreateNewsletterSubscriberDto,
  ): Promise<{ id: string; createdAt: Date }> {
    try {
      const saved = await this.prisma.newsletterSubscriber.create({
        data: {
          email: dto.email,
          locale: dto.locale ?? null,
          source: 'footer-form',
          status: NewsletterSubscriberStatus.subscribed,
          unsubscribeToken: crypto.randomBytes(24).toString('hex'),
        },
      });
      return { id: saved.id, createdAt: saved.createdAt };
    } catch (err) {
      if ((err as { code?: string }).code === PRISMA_UNIQUE_CONSTRAINT) {
        // Already subscribed — treat as success without exposing enumeration info.
        const existing = await this.prisma.newsletterSubscriber.findUnique({
          where: { email: dto.email },
        });
        return {
          id: existing?.id ?? 'ok',
          createdAt: existing?.createdAt ?? new Date(),
        };
      }
      this.logger.error('Failed to save newsletter subscriber', err as Error);
      throw err;
    }
  }

  async unsubscribeByToken(token: string): Promise<{ id: string } | null> {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { unsubscribeToken: token },
    });
    if (
      !subscriber ||
      subscriber.status === NewsletterSubscriberStatus.unsubscribed
    )
      return null;

    await this.prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: NewsletterSubscriberStatus.unsubscribed,
        unsubscribedAt: new Date(),
      },
    });
    return { id: subscriber.id };
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminList(filters: AdminListFilters) {
    const {
      search,
      status,
      locale,
      source,
      tag,
      limit = 20,
      offset = 0,
    } = filters;
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(search ? { email: { contains: search, mode: 'insensitive' } } : {}),
      ...(status ? { status } : {}),
      ...(locale ? { locale } : {}),
      ...(source ? { source } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return { items, total };
  }

  async createManual(dto: CreateSubscriberAdminDto) {
    try {
      return await this.prisma.newsletterSubscriber.create({
        data: {
          email: dto.email,
          locale: dto.locale ?? null,
          status: dto.status ?? NewsletterSubscriberStatus.subscribed,
          source: dto.source ?? 'admin-manual',
          tags: dto.tags ?? [],
          unsubscribeToken: crypto.randomBytes(24).toString('hex'),
          lastActivityAt: new Date(),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === PRISMA_UNIQUE_CONSTRAINT) {
        throw new Error('A subscriber with this email already exists');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateSubscriberDto) {
    return this.prisma.newsletterSubscriber.update({
      where: { id },
      data: {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.status !== undefined
          ? {
              status: dto.status,
              unsubscribedAt:
                dto.status === NewsletterSubscriberStatus.unsubscribed
                  ? new Date()
                  : null,
            }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
  }

  async bulkAction(
    dto: BulkSubscriberActionDto,
  ): Promise<{ affected: number }> {
    const { ids, action, tag } = dto;

    switch (action) {
      case 'unsubscribe': {
        const result = await this.prisma.newsletterSubscriber.updateMany({
          where: { id: { in: ids } },
          data: {
            status: NewsletterSubscriberStatus.unsubscribed,
            unsubscribedAt: new Date(),
          },
        });
        return { affected: result.count };
      }
      case 'resubscribe': {
        const result = await this.prisma.newsletterSubscriber.updateMany({
          where: { id: { in: ids } },
          data: {
            status: NewsletterSubscriberStatus.subscribed,
            unsubscribedAt: null,
          },
        });
        return { affected: result.count };
      }
      case 'delete': {
        const result = await this.prisma.newsletterSubscriber.deleteMany({
          where: { id: { in: ids } },
        });
        return { affected: result.count };
      }
      case 'add_tag': {
        const result = await this.prisma.$executeRaw`
          UPDATE newsletter_subscribers SET tags = array_append(tags, ${tag})
          WHERE id = ANY(${ids}::uuid[]) AND NOT (tags @> ARRAY[${tag}]::text[])
        `;
        return { affected: Number(result) };
      }
      case 'remove_tag': {
        const result = await this.prisma.$executeRaw`
          UPDATE newsletter_subscribers SET tags = array_remove(tags, ${tag})
          WHERE id = ANY(${ids}::uuid[])
        `;
        return { affected: Number(result) };
      }
      default:
        return { affected: 0 };
    }
  }

  async exportCsv(
    filters: Omit<AdminListFilters, 'limit' | 'offset'>,
  ): Promise<string> {
    const { search, status, locale, source, tag } = filters;
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(search ? { email: { contains: search, mode: 'insensitive' } } : {}),
      ...(status ? { status } : {}),
      ...(locale ? { locale } : {}),
      ...(source ? { source } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    };
    const rows = await this.prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const header = [
      'email',
      'status',
      'source',
      'locale',
      'tags',
      'subscribedAt',
      'lastActivityAt',
      'unsubscribedAt',
    ];
    const lines = [header.join(',')];

    for (const row of rows) {
      lines.push(
        [
          row.email,
          row.status,
          row.source ?? '',
          row.locale ?? '',
          row.tags.join(';'),
          row.createdAt?.toISOString() ?? '',
          row.lastActivityAt?.toISOString() ?? '',
          row.unsubscribedAt?.toISOString() ?? '',
        ]
          .map((field) => this.csvField(field))
          .join(','),
      );
    }

    return lines.join('\n');
  }

  /** Marks a recipient's tracking pixel as opened and bumps the subscriber's activity timestamp. */
  async recordOpen(token: string): Promise<void> {
    const recipient = await this.prisma.newsletterCampaignRecipient.findUnique({
      where: { trackingToken: token },
    });
    if (!recipient) return;

    if (!recipient.openedAt) {
      await this.prisma.newsletterCampaignRecipient.update({
        where: { id: recipient.id },
        data: { openedAt: new Date() },
      });
    }
    if (recipient.subscriberId) {
      await this.prisma.newsletterSubscriber.update({
        where: { id: recipient.subscriberId },
        data: { lastActivityAt: new Date() },
      });
    }
  }

  /** Marks a recipient's tracked link as clicked and bumps the subscriber's activity timestamp. */
  async recordClick(token: string): Promise<void> {
    const recipient = await this.prisma.newsletterCampaignRecipient.findUnique({
      where: { trackingToken: token },
    });
    if (!recipient) return;

    if (!recipient.clickedAt) {
      await this.prisma.newsletterCampaignRecipient.update({
        where: { id: recipient.id },
        data: { clickedAt: new Date() },
      });
    }
    if (recipient.subscriberId) {
      await this.prisma.newsletterSubscriber.update({
        where: { id: recipient.subscriberId },
        data: { lastActivityAt: new Date() },
      });
    }
  }

  private csvField(value: string): string {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
