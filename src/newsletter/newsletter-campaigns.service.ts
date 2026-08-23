import * as crypto from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  AudienceDefinition,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';
import {
  NewsletterCampaignStatus,
  NewsletterRecipientStatus,
  Prisma,
} from '../../generated/prisma/client';
import { NewsletterMailerService } from './newsletter-mailer.service';
import {
  NEWSLETTER_CAMPAIGN_QUEUE,
  NEWSLETTER_SEND_CAMPAIGN_JOB,
  NewsletterCampaignJobData,
} from './newsletter.constants';
import { NewsletterSegmentationService } from './newsletter-segmentation.service';

export interface CampaignListFilters {
  status?: NewsletterCampaignStatus;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class NewsletterCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NEWSLETTER_CAMPAIGN_QUEUE)
    private readonly queue: Queue<NewsletterCampaignJobData>,
    private readonly segmentation: NewsletterSegmentationService,
    private readonly mailer: NewsletterMailerService,
  ) {}

  async list(filters: CampaignListFilters) {
    const { status, type, search, limit = 20, offset = 0 } = filters;
    const where: Prisma.NewsletterCampaignWhereInput = {
      ...(status ? { status } : {}),
      ...(type ? { type: type as never } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.newsletterCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.newsletterCampaign.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.newsletterCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  create(dto: CreateCampaignDto) {
    return this.prisma.newsletterCampaign.create({
      data: {
        title: dto.title,
        subject: dto.subject,
        previewText: dto.previewText ?? null,
        htmlContent: dto.htmlContent ?? '',
        audience: (dto.audience ?? { segment: 'all' }) as Prisma.InputJsonValue,
        type: dto.type,
        tags: dto.tags ?? [],
        status: NewsletterCampaignStatus.draft,
      },
    });
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOne(id);
    if (
      campaign.status !== NewsletterCampaignStatus.draft &&
      campaign.status !== NewsletterCampaignStatus.scheduled
    ) {
      throw new BadRequestException(
        'Only draft or scheduled campaigns can be edited',
      );
    }

    return this.prisma.newsletterCampaign.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.previewText !== undefined
          ? { previewText: dto.previewText ?? null }
          : {}),
        ...(dto.htmlContent !== undefined
          ? { htmlContent: dto.htmlContent }
          : {}),
        ...(dto.audience !== undefined
          ? { audience: dto.audience as Prisma.InputJsonValue }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    const campaign = await this.findOne(id);
    if (campaign.status !== NewsletterCampaignStatus.draft) {
      throw new BadRequestException('Only draft campaigns can be deleted');
    }
    await this.prisma.newsletterCampaign.delete({ where: { id } });
  }

  async duplicate(id: string) {
    const campaign = await this.findOne(id);
    return this.prisma.newsletterCampaign.create({
      data: {
        title: `${campaign.title} (copy)`,
        subject: campaign.subject,
        previewText: campaign.previewText,
        htmlContent: campaign.htmlContent,
        audience: campaign.audience as Prisma.InputJsonValue,
        type: campaign.type,
        tags: campaign.tags,
        status: NewsletterCampaignStatus.draft,
      },
    });
  }

  previewAudienceCount(audience: AudienceDefinition): Promise<number> {
    return this.segmentation.count(audience);
  }

  async schedule(id: string, scheduledAt: Date) {
    const campaign = await this.findOne(id);
    if (campaign.status !== NewsletterCampaignStatus.draft) {
      throw new BadRequestException('Only draft campaigns can be scheduled');
    }

    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    const job = await this.queue.add(
      NEWSLETTER_SEND_CAMPAIGN_JOB,
      { campaignId: id },
      {
        delay,
        jobId: `campaign-${id}`,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    return this.prisma.newsletterCampaign.update({
      where: { id },
      data: {
        status: NewsletterCampaignStatus.scheduled,
        scheduledAt,
        bullJobId: job.id ?? null,
      },
    });
  }

  async cancel(id: string) {
    const campaign = await this.findOne(id);
    if (campaign.status !== NewsletterCampaignStatus.scheduled) {
      throw new BadRequestException(
        'Only scheduled campaigns can be cancelled',
      );
    }

    if (campaign.bullJobId) {
      const job = await this.queue.getJob(campaign.bullJobId);
      if (job) await job.remove();
    }

    return this.prisma.newsletterCampaign.update({
      where: { id },
      data: {
        status: NewsletterCampaignStatus.draft,
        scheduledAt: null,
        bullJobId: null,
      },
    });
  }

  async sendNow(id: string) {
    const campaign = await this.findOne(id);
    if (campaign.status !== NewsletterCampaignStatus.draft) {
      throw new BadRequestException('Only draft campaigns can be sent');
    }

    const job = await this.queue.add(
      NEWSLETTER_SEND_CAMPAIGN_JOB,
      { campaignId: id },
      {
        delay: 0,
        jobId: `campaign-${id}`,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    return this.prisma.newsletterCampaign.update({
      where: { id },
      data: {
        status: NewsletterCampaignStatus.scheduled,
        scheduledAt: new Date(),
        bullJobId: job.id ?? null,
      },
    });
  }

  async sendTest(id: string, to: string): Promise<void> {
    const campaign = await this.findOne(id);
    const html = this.mailer.buildTrackedHtml(campaign.htmlContent, {
      trackingToken: 'test',
      unsubscribeToken: 'test',
    });
    await this.mailer.sendTestEmail(to, campaign.subject, html);
  }

  /**
   * Inserts one recipient row per subscriber in the campaign's audience.
   * skipDuplicates makes this safe to call again on job retries.
   */
  async materializeRecipients(campaignId: string): Promise<void> {
    const campaign = await this.findOne(campaignId);

    for await (const batch of this.segmentation.iterateSubscribers(
      campaign.audience as AudienceDefinition,
    )) {
      await this.prisma.newsletterCampaignRecipient.createMany({
        data: batch.map((subscriber) => ({
          campaignId,
          subscriberId: subscriber.id,
          email: subscriber.email,
          status: NewsletterRecipientStatus.pending,
          trackingToken: crypto.randomBytes(24).toString('hex'),
        })),
        skipDuplicates: true,
      });
    }
  }
}
