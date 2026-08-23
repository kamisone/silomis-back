import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceRuleDto, UpdatePriceRuleDto } from './dto/price-rule.dto';
import { PriceRule } from '../../generated/prisma/client';

export interface PriceRuleLineInput {
  productId: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PriceRuleDiscount {
  discountCents: number;
  ruleId: string;
  ruleName: string;
}

@Injectable()
export class PriceRulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin CRUD ───────────────────────────────────────────────────────────

  async list(filter: { scope?: string; isActive?: boolean; limit?: number; offset?: number } = {}) {
    const { scope, isActive, limit = 20, offset = 0 } = filter;
    const where = {
      ...(scope !== undefined ? { scope: scope as PriceRule['scope'] } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.priceRule.findMany({
        where,
        include: { product: { select: { id: true, title: true } }, variant: { select: { id: true, title: true, sku: true } } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.priceRule.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const rule = await this.prisma.priceRule.findUnique({
      where: { id },
      include: { product: { select: { id: true, title: true } }, variant: { select: { id: true, title: true, sku: true } } },
    });
    if (!rule) throw new NotFoundException('Price rule not found');
    return rule;
  }

  create(dto: CreatePriceRuleDto) {
    return this.prisma.priceRule.create({
      data: {
        name: dto.name,
        type: dto.type,
        value: dto.value,
        scope: dto.scope ?? 'product',
        variantId: dto.scope === 'variant' ? dto.variantId : null,
        productId: dto.scope === 'product' ? dto.productId : null,
        minQty: dto.minQty ?? 1,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ?? null,
        expiresAt: dto.expiresAt ?? null,
      },
    });
  }

  async update(id: string, dto: UpdatePriceRuleDto) {
    const existing = await this.findOne(id);
    const scope = dto.scope ?? existing.scope;

    return this.prisma.priceRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        variantId: scope === 'variant' ? (dto.variantId !== undefined ? dto.variantId : existing.variantId) : null,
        productId: scope === 'product' ? (dto.productId !== undefined ? dto.productId : existing.productId) : null,
        ...(dto.minQty !== undefined ? { minQty: dto.minQty } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.priceRule.delete({ where: { id } });
  }

  // ── Pricing engine hook ──────────────────────────────────────────────────
  // Called from PricingEngineService.compute() as an ADDITIONAL discount
  // layer alongside ShopPromotion — never touches unit-price resolution
  // (Product.upsellTiers / resolveUnitPriceForQuantity stay the sole
  // authority for a line's base unitPriceCents, see
  // src/pricing/variant-price.util.ts). Batched (one query for every line)
  // to avoid N+1s, mirroring PricingEngineService.loadActiveAutomatic.

  async resolveDiscountsForLines(lines: PriceRuleLineInput[]): Promise<Map<string, PriceRuleDiscount>> {
    const now = new Date();
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const variantIds = [...new Set(lines.map((l) => l.variantId))];

    const candidates = await this.prisma.priceRule.findMany({
      where: {
        isActive: true,
        OR: [{ scope: 'global' }, { scope: 'product', productId: { in: productIds } }, { scope: 'variant', variantId: { in: variantIds } }],
      },
    });
    const active = candidates.filter((r) => this.isWithinWindow(r, now));

    const result = new Map<string, PriceRuleDiscount>();
    for (const line of lines) {
      let best: (PriceRuleDiscount & { priority: number }) | null = null;

      for (const rule of active) {
        if (line.quantity < rule.minQty) continue;
        const matches = rule.scope === 'global' || (rule.scope === 'product' && rule.productId === line.productId) || (rule.scope === 'variant' && rule.variantId === line.variantId);
        if (!matches) continue;

        const lineTotal = line.unitPriceCents * line.quantity;
        // override sets the line's unit price to `value` outright — expressed here as
        // the discount that gets it there. Never negative: an override at or above the
        // resolved price is not a discount, so it simply doesn't win over a real one.
        const discountCents =
          rule.type === 'percentage_off' ? Math.round((lineTotal * rule.value) / 100) : rule.type === 'fixed_off' ? Math.min(rule.value, lineTotal) : Math.max(0, lineTotal - rule.value * line.quantity);

        if (!best || rule.priority > best.priority || (rule.priority === best.priority && discountCents > best.discountCents)) {
          best = { discountCents, priority: rule.priority, ruleId: rule.id, ruleName: rule.name };
        }
      }

      if (best && best.discountCents > 0) result.set(line.variantId, { discountCents: best.discountCents, ruleId: best.ruleId, ruleName: best.ruleName });
    }
    return result;
  }

  private isWithinWindow(rule: PriceRule, now: Date): boolean {
    return (!rule.startsAt || rule.startsAt <= now) && (!rule.expiresAt || rule.expiresAt >= now);
  }
}
