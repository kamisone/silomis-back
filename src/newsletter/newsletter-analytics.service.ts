import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  NewsletterCampaignStatus,
  NewsletterRecipientStatus,
  NewsletterSubscriberStatus,
} from '../../generated/prisma/client';

export interface NewsletterOverview {
  totalSubscribers: number;
  subscribedCount: number;
  unsubscribedCount: number;
  bouncedCount: number;
  sentEmails: number;
  openRate: number;
  clickRate: number;
  unsubscribeRate: number;
  bounceRate: number;
}

export interface SubscriberGrowthPoint {
  date: string;
  newSubscribers: number;
  totalSubscribers: number;
}

export interface CampaignPerformanceRow {
  id: string;
  title: string;
  subject: string;
  sentAt: Date | null;
  recipients: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  openRate: number;
  clickRate: number;
}

@Injectable()
export class NewsletterAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<NewsletterOverview> {
    const [subscribedCount, unsubscribedCount, bouncedCount] =
      await Promise.all([
        this.prisma.newsletterSubscriber.count({
          where: { status: NewsletterSubscriberStatus.subscribed },
        }),
        this.prisma.newsletterSubscriber.count({
          where: { status: NewsletterSubscriberStatus.unsubscribed },
        }),
        this.prisma.newsletterSubscriber.count({
          where: { status: NewsletterSubscriberStatus.bounced },
        }),
      ]);
    const totalSubscribers = subscribedCount + unsubscribedCount + bouncedCount;

    const [sentEmails, opened, clicked, unsubscribedFromCampaigns] =
      await Promise.all([
        this.prisma.newsletterCampaignRecipient.count({
          where: { status: NewsletterRecipientStatus.sent },
        }),
        this.prisma.newsletterCampaignRecipient.count({
          where: {
            status: NewsletterRecipientStatus.sent,
            openedAt: { not: null },
          },
        }),
        this.prisma.newsletterCampaignRecipient.count({
          where: {
            status: NewsletterRecipientStatus.sent,
            clickedAt: { not: null },
          },
        }),
        this.prisma.newsletterCampaignRecipient.count({
          where: {
            status: NewsletterRecipientStatus.sent,
            unsubscribedAt: { not: null },
          },
        }),
      ]);

    return {
      totalSubscribers,
      subscribedCount,
      unsubscribedCount,
      bouncedCount,
      sentEmails,
      openRate: sentEmails > 0 ? opened / sentEmails : 0,
      clickRate: sentEmails > 0 ? clicked / sentEmails : 0,
      unsubscribeRate:
        sentEmails > 0 ? unsubscribedFromCampaigns / sentEmails : 0,
      bounceRate: totalSubscribers > 0 ? bouncedCount / totalSubscribers : 0,
    };
  }

  async subscriberGrowth(days = 30): Promise<SubscriberGrowthPoint[]> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const totalBefore = await this.prisma.newsletterSubscriber.count({
      where: { createdAt: { lt: since } },
    });

    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM newsletter_subscribers
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `;

    const byDay = new Map<string, number>();
    for (const row of rows) {
      byDay.set(
        new Date(row.day).toISOString().slice(0, 10),
        Number(row.count),
      );
    }

    const points: SubscriberGrowthPoint[] = [];
    let running = totalBefore;
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const newSubscribers = byDay.get(key) ?? 0;
      running += newSubscribers;
      points.push({ date: key, newSubscribers, totalSubscribers: running });
    }

    return points;
  }

  async campaignPerformance(limit = 20): Promise<CampaignPerformanceRow[]> {
    const campaigns = await this.prisma.newsletterCampaign.findMany({
      where: { status: NewsletterCampaignStatus.sent },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });

    return Promise.all(
      campaigns.map(async (camp) => {
        const [recipients, opens, clicks, unsubscribes] = await Promise.all([
          this.prisma.newsletterCampaignRecipient.count({
            where: { campaignId: camp.id },
          }),
          this.prisma.newsletterCampaignRecipient.count({
            where: { campaignId: camp.id, openedAt: { not: null } },
          }),
          this.prisma.newsletterCampaignRecipient.count({
            where: { campaignId: camp.id, clickedAt: { not: null } },
          }),
          this.prisma.newsletterCampaignRecipient.count({
            where: { campaignId: camp.id, unsubscribedAt: { not: null } },
          }),
        ]);
        return {
          id: camp.id,
          title: camp.title,
          subject: camp.subject,
          sentAt: camp.sentAt,
          recipients,
          opens,
          clicks,
          unsubscribes,
          openRate: recipients > 0 ? opens / recipients : 0,
          clickRate: recipients > 0 ? clicks / recipients : 0,
        };
      }),
    );
  }
}
