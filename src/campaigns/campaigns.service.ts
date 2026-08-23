import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { isActive?: boolean; limit?: number; offset?: number } = {}) {
    const { isActive, limit = 20, offset = 0 } = filter;
    const where = isActive !== undefined ? { isActive } : {};
    const [items, total] = await Promise.all([this.prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }), this.prisma.campaign.count({ where })]);
    return { items, total };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async findOneWithPromotions(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id }, include: { promotions: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  create(dto: CreateCampaignDto) {
    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        bannerImageKey: dto.bannerImageKey ?? null,
        startsAt: dto.startsAt ?? null,
        expiresAt: dto.expiresAt ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCampaignDto) {
    await this.findOne(id);
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.bannerImageKey !== undefined ? { bannerImageKey: dto.bannerImageKey } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.campaign.delete({ where: { id } });
  }

  /** Sum of usesCount across every promotion linked to this campaign — no separate tracking table needed. */
  async performance(id: string) {
    await this.findOne(id);
    const promotions = await this.prisma.shopPromotion.findMany({
      where: { campaignId: id },
      select: { id: true, name: true, usesCount: true, maxUsesTotal: true },
    });
    return {
      promotionCount: promotions.length,
      totalUses: promotions.reduce((sum, p) => sum + p.usesCount, 0),
      promotions,
    };
  }
}
