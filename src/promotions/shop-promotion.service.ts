import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { Prisma, PromotionDiscountType, PromotionScope, PromotionTrigger } from '../../generated/prisma/client';

export interface ActivePromotionPublicDto {
  id: string;
  name: string;
  description: string | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  scope: PromotionScope;
  linkedCategoryIds: string[];
  linkedProductIds: string[];
}

@Injectable()
export class ShopPromotionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Promotion CRUD ────────────────────────────────────────────────────────

  async list(
    filter: {
      trigger?: PromotionTrigger;
      scope?: PromotionScope;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { trigger, scope, isActive, limit = 20, offset = 0 } = filter;
    const where: Prisma.ShopPromotionWhereInput = {
      ...(trigger !== undefined ? { trigger } : {}),
      ...(scope !== undefined ? { scope } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.shopPromotion.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.shopPromotion.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const p = await this.prisma.shopPromotion.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Promotion not found');
    return p;
  }

  async findOneWithLinks(id: string) {
    const p = await this.prisma.shopPromotion.findUnique({
      where: { id },
      include: {
        categoryLinks: { include: { category: true } },
        productLinks: { include: { product: true } },
      },
    });
    if (!p) throw new NotFoundException('Promotion not found');
    return p;
  }

  async create(dto: CreatePromotionDto) {
    this.validateDto(dto);
    const code = this.normalizeCode(dto.trigger === 'coupon' ? dto.code : null);
    if (code) await this.assertCodeAvailable(code, null);

    return this.prisma.shopPromotion.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        marketingLabel: dto.marketingLabel ?? null,
        bannerText: dto.bannerText ?? null,
        trigger: dto.trigger,
        code,
        discountType: dto.discountType,
        discountValue: dto.discountValue ?? 0,
        scope: dto.scope ?? 'site_wide',
        minOrderCents: dto.minOrderCents ?? null,
        maxUsesTotal: dto.maxUsesTotal ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ?? null,
        expiresAt: dto.expiresAt ?? null,
        campaignId: dto.campaignId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const existing = await this.findOne(id);
    const trigger = dto.trigger ?? existing.trigger;

    if (dto.trigger !== undefined || dto.discountType !== undefined || dto.code !== undefined) {
      this.validateDto({
        trigger,
        code: dto.code !== undefined ? dto.code : existing.code,
        discountType: dto.discountType ?? existing.discountType,
        discountValue: dto.discountValue ?? existing.discountValue,
      } as CreatePromotionDto);
    }

    // Force code null when switching to automatic; otherwise normalize whatever was sent.
    const code = trigger === 'automatic' ? null : dto.code !== undefined ? this.normalizeCode(dto.code) : existing.code;

    if (code && code !== existing.code) await this.assertCodeAvailable(code, id);

    return this.prisma.shopPromotion.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.marketingLabel !== undefined ? { marketingLabel: dto.marketingLabel } : {}),
        ...(dto.bannerText !== undefined ? { bannerText: dto.bannerText } : {}),
        ...(dto.trigger !== undefined ? { trigger: dto.trigger } : {}),
        code,
        ...(dto.discountType !== undefined ? { discountType: dto.discountType } : {}),
        ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.minOrderCents !== undefined ? { minOrderCents: dto.minOrderCents } : {}),
        ...(dto.maxUsesTotal !== undefined ? { maxUsesTotal: dto.maxUsesTotal } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt } : {}),
        ...(dto.campaignId !== undefined ? { campaignId: dto.campaignId } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.shopPromotion.delete({ where: { id } });
  }

  // ── Category links ────────────────────────────────────────────────────────

  async listCategoryLinks(promotionId: string) {
    await this.findOne(promotionId);
    return this.prisma.promotionCategory.findMany({
      where: { promotionId },
      include: { category: true },
      orderBy: { categoryId: 'asc' },
    });
  }

  async addCategoryLink(promotionId: string, categoryId: string) {
    const p = await this.findOne(promotionId);
    if (p.scope !== 'category') throw new BadRequestException('Promotion scope must be "category" to add category links');
    const existing = await this.prisma.promotionCategory.findUnique({
      where: { promotionId_categoryId: { promotionId, categoryId } },
      include: { category: true },
    });
    if (existing) return existing;
    return this.prisma.promotionCategory.create({
      data: { promotionId, categoryId },
      include: { category: true },
    });
  }

  async removeCategoryLink(promotionId: string, linkId: string): Promise<void> {
    const link = await this.prisma.promotionCategory.findFirst({ where: { id: linkId, promotionId } });
    if (!link) throw new NotFoundException('Category link not found');
    await this.prisma.promotionCategory.delete({ where: { id: linkId } });
  }

  // ── Product links ─────────────────────────────────────────────────────────

  async listProductLinks(promotionId: string) {
    await this.findOne(promotionId);
    return this.prisma.promotionProduct.findMany({
      where: { promotionId },
      include: { product: true },
      orderBy: { productId: 'asc' },
    });
  }

  async addProductLink(promotionId: string, productId: string) {
    const p = await this.findOne(promotionId);
    if (p.scope !== 'product') throw new BadRequestException('Promotion scope must be "product" to add product links');
    const existing = await this.prisma.promotionProduct.findUnique({
      where: { promotionId_productId: { promotionId, productId } },
      include: { product: true },
    });
    if (existing) return existing;
    return this.prisma.promotionProduct.create({
      data: { promotionId, productId },
      include: { product: true },
    });
  }

  async removeProductLink(promotionId: string, linkId: string): Promise<void> {
    const link = await this.prisma.promotionProduct.findFirst({ where: { id: linkId, promotionId } });
    if (!link) throw new NotFoundException('Product link not found');
    await this.prisma.promotionProduct.delete({ where: { id: linkId } });
  }

  // ── Public listing ───────────────────────────────────────────────────────

  async listActiveAutoForPublic(): Promise<ActivePromotionPublicDto[]> {
    const now = new Date();
    const promos = await this.prisma.shopPromotion.findMany({
      where: {
        isActive: true,
        trigger: 'automatic',
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
      },
      orderBy: { priority: 'desc' },
      include: { categoryLinks: true, productLinks: true },
    });

    return promos.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      discountType: p.discountType,
      discountValue: p.discountValue,
      scope: p.scope,
      linkedCategoryIds: p.categoryLinks.map((l) => l.categoryId),
      linkedProductIds: p.productLinks.map((l) => l.productId),
    }));
  }

  // ── Validation / normalization ──────────────────────────────────────────

  private normalizeCode(code: string | null | undefined): string | null {
    const trimmed = code?.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  }

  private async assertCodeAvailable(code: string, excludeId: string | null): Promise<void> {
    const existing = await this.prisma.shopPromotion.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Code "${code}" already in use`);
  }

  private validateDto(dto: Pick<CreatePromotionDto, 'trigger' | 'code' | 'discountType' | 'discountValue'>) {
    if (dto.trigger === 'coupon' && !dto.code?.trim()) {
      throw new BadRequestException('A coupon code is required when trigger is "coupon"');
    }
    if (dto.discountType !== 'free_shipping' && (dto.discountValue === undefined || dto.discountValue < 0)) {
      throw new BadRequestException('discountValue must be a non-negative number');
    }
  }
}
