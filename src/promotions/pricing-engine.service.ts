import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriceRulesService } from '../price-rules/price-rules.service';
import { PromotionDiscountType, PromotionScope, ShopPromotion } from '../../generated/prisma/client';

// ── Input / output types ──────────────────────────────────────────────────────

export interface LineItemInput {
  productId: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  /** The product's category ids, for scope matching. */
  categoryIds: string[];
}

export interface PricedLine {
  productId: string;
  variantId: string;
  lineTotalCents: number;
  categoryDiscountCents: number;
  appliedPromotionId?: string;
  appliedPromotionName?: string;
  /// Additional discount from PriceRule, layered on top of the promotion discount above (see PriceRulesService.resolveDiscountsForLines).
  priceRuleDiscountCents: number;
  appliedPriceRuleId?: string;
  appliedPriceRuleName?: string;
}

export interface PricingResult {
  lines: PricedLine[];
  rawSubtotalCents: number;
  categoryDiscountCents: number;
  priceRuleDiscountCents: number;
  afterCategorySubtotalCents: number;
  couponDiscountCents: number;
  totalDiscountCents: number;
  couponCode: string | null;
  appliedCouponPromotionId: string | null;
  appliedCouponName: string | null;
  /** True only when a promotion/coupon grants free shipping — product-level free shipping is resolved separately by the caller. */
  freeShipping: boolean;
  /** Always empty today — promotions carry no upgrade-method configuration; kept for shape parity with the product-level signal the caller merges in. */
  freeShippingUpgradeMethodIds: string[];
}

export type ValidateCouponReason = 'invalid' | 'not_yet_active' | 'expired' | 'usage_limit_reached' | 'min_order_not_met';

export interface ValidateCouponResult {
  valid: boolean;
  discountCents: number;
  freeShipping: boolean;
  name?: string;
  reason?: ValidateCouponReason;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PricingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceRules: PriceRulesService,
  ) {}

  /**
   * Compute the full pricing breakdown for a set of cart/order lines.
   *
   * Pipeline:
   *   1. Apply automatic promotions per line (highest-priority / best-discount wins).
   *   2. Apply the best matching PriceRule per line, on top of the promotion discount.
   *   3. Apply a coupon discount on top of the post-category subtotal.
   *
   * All logic is server-side and deterministic; the client never computes prices.
   */
  async compute(lines: LineItemInput[], couponCode?: string | null): Promise<PricingResult> {
    const now = new Date();

    const validAuto = await this.loadActiveAutomatic(now);
    const { categoryIdsByPromo, productIdsByPromo } = await this.loadScopeData(validAuto);
    const priceRuleDiscounts = await this.priceRules.resolveDiscountsForLines(lines);

    // ── Apply best automatic promotion, then the best matching price rule, per line ──
    let rawSubtotal = 0;
    let totalCategoryDiscount = 0;
    let totalPriceRuleDiscount = 0;

    const pricedLines: PricedLine[] = lines.map((line) => {
      const lineTotal = line.unitPriceCents * line.quantity;
      rawSubtotal += lineTotal;

      let bestDiscount = 0;
      let bestPriority = -Infinity;
      let bestPromoId: string | undefined;
      let bestPromoName: string | undefined;

      for (const promo of validAuto) {
        if (promo.discountType === 'free_shipping') continue; // handled separately below
        const matches = this.lineMatchesScope(promo.scope, categoryIdsByPromo.get(promo.id) ?? new Set(), productIdsByPromo.get(promo.id) ?? new Set(), line);
        if (!matches) continue;

        const discount = this.computeDiscount(promo.discountType, promo.discountValue, lineTotal);
        const priority = promo.priority ?? 0;

        if (priority > bestPriority || (priority === bestPriority && discount > bestDiscount)) {
          bestDiscount = discount;
          bestPriority = priority;
          bestPromoId = promo.id;
          bestPromoName = promo.name;
        }
      }

      const clampedDiscount = Math.min(bestDiscount, lineTotal);
      totalCategoryDiscount += clampedDiscount;

      // Price rule discount is layered on top, clamped to whatever headroom
      // the promotion discount left — a line can never go negative even if
      // both a promotion and a price rule match it.
      const ruleMatch = priceRuleDiscounts.get(line.variantId);
      const ruleDiscount = ruleMatch ? Math.min(ruleMatch.discountCents, Math.max(0, lineTotal - clampedDiscount)) : 0;
      totalPriceRuleDiscount += ruleDiscount;

      return {
        productId: line.productId,
        variantId: line.variantId,
        lineTotalCents: lineTotal - clampedDiscount - ruleDiscount,
        categoryDiscountCents: clampedDiscount,
        appliedPromotionId: bestPromoId,
        appliedPromotionName: bestPromoName,
        priceRuleDiscountCents: ruleDiscount,
        appliedPriceRuleId: ruleDiscount > 0 ? ruleMatch!.ruleId : undefined,
        appliedPriceRuleName: ruleDiscount > 0 ? ruleMatch!.ruleName : undefined,
      };
    });

    // Any matching automatic free_shipping promotion (scope-matched against at
    // least one line) grants free shipping for the whole order.
    const autoFreeShipping = validAuto.some((promo) => promo.discountType === 'free_shipping' && lines.some((line) => this.lineMatchesScope(promo.scope, categoryIdsByPromo.get(promo.id) ?? new Set(), productIdsByPromo.get(promo.id) ?? new Set(), line)));

    const afterCategorySubtotal = rawSubtotal - totalCategoryDiscount - totalPriceRuleDiscount;

    // ── Apply coupon ─────────────────────────────────────────────────────────
    let couponDiscountCents = 0;
    let validCouponCode: string | null = null;
    let appliedCouponPromoId: string | null = null;
    let appliedCouponName: string | null = null;
    let couponFreeShipping = false;

    if (couponCode) {
      const normalized = this.normalizeCode(couponCode);
      const coupon = await this.prisma.shopPromotion.findFirst({ where: { code: normalized, isActive: true, trigger: 'coupon' } });

      if (coupon && this.isWithinWindow(coupon, now) && this.isUnderUsageCap(coupon)) {
        const { categoryIds: couponCatIds, productIds: couponProdIds } = await this.loadScopeSetsForOne(coupon);

        let eligibleAmount = 0;
        for (const pl of pricedLines) {
          const line = lines.find((l) => l.variantId === pl.variantId)!;
          if (this.lineMatchesScope(coupon.scope, couponCatIds, couponProdIds, line)) {
            eligibleAmount += pl.lineTotalCents;
          }
        }

        if (coupon.minOrderCents === null || eligibleAmount >= coupon.minOrderCents) {
          if (coupon.discountType === 'free_shipping') {
            couponFreeShipping = eligibleAmount > 0;
          } else {
            couponDiscountCents = this.computeDiscount(coupon.discountType, coupon.discountValue, eligibleAmount);
          }
        }

        if (couponDiscountCents > 0 || couponFreeShipping) {
          validCouponCode = normalized;
          appliedCouponPromoId = coupon.id;
          appliedCouponName = coupon.name;
        }
      }
    }

    const clampedCouponDiscount = Math.min(couponDiscountCents, afterCategorySubtotal);

    return {
      lines: pricedLines,
      rawSubtotalCents: rawSubtotal,
      categoryDiscountCents: totalCategoryDiscount,
      priceRuleDiscountCents: totalPriceRuleDiscount,
      afterCategorySubtotalCents: afterCategorySubtotal,
      couponDiscountCents: clampedCouponDiscount,
      totalDiscountCents: totalCategoryDiscount + totalPriceRuleDiscount + clampedCouponDiscount,
      couponCode: validCouponCode,
      appliedCouponPromotionId: appliedCouponPromoId,
      appliedCouponName,
      freeShipping: autoFreeShipping || couponFreeShipping,
      freeShippingUpgradeMethodIds: [],
    };
  }

  /**
   * Explicit "Apply coupon" preview check — same lookup/eligibility rules as
   * `compute()`'s coupon step, but returns a machine-readable failure reason
   * instead of silently zeroing out the discount, so the frontend can show a
   * real error message.
   */
  async validateCoupon(code: string, cartLines: LineItemInput[]): Promise<ValidateCouponResult> {
    const now = new Date();
    const normalized = this.normalizeCode(code);
    const coupon = await this.prisma.shopPromotion.findFirst({ where: { code: normalized, trigger: 'coupon' } });

    if (!coupon || !coupon.isActive) return { valid: false, discountCents: 0, freeShipping: false, reason: 'invalid' };
    if (coupon.startsAt && coupon.startsAt > now) return { valid: false, discountCents: 0, freeShipping: false, reason: 'not_yet_active' };
    if (coupon.expiresAt && coupon.expiresAt < now) return { valid: false, discountCents: 0, freeShipping: false, reason: 'expired' };
    if (!this.isUnderUsageCap(coupon)) return { valid: false, discountCents: 0, freeShipping: false, reason: 'usage_limit_reached' };

    // Category discounts apply before the coupon, same as compute() — so the
    // eligible amount here must be computed against post-category totals too.
    const pricing = await this.compute(cartLines, null);
    const { categoryIds: couponCatIds, productIds: couponProdIds } = await this.loadScopeSetsForOne(coupon);

    let eligibleAmount = 0;
    for (const pl of pricing.lines) {
      const line = cartLines.find((l) => l.variantId === pl.variantId)!;
      if (this.lineMatchesScope(coupon.scope, couponCatIds, couponProdIds, line)) {
        eligibleAmount += pl.lineTotalCents;
      }
    }

    if (coupon.minOrderCents !== null && eligibleAmount < coupon.minOrderCents) {
      return { valid: false, discountCents: 0, freeShipping: false, reason: 'min_order_not_met' };
    }

    if (coupon.discountType === 'free_shipping') {
      return { valid: true, discountCents: 0, freeShipping: eligibleAmount > 0, name: coupon.name };
    }

    const discountCents = Math.min(this.computeDiscount(coupon.discountType, coupon.discountValue, eligibleAmount), pricing.afterCategorySubtotalCents);
    return { valid: true, discountCents, freeShipping: false, name: coupon.name };
  }

  // ── Product-level badge resolution (PDP) ─────────────────────────────────

  async getActiveForProduct(productId: string): Promise<{ id: string; name: string; discountType: PromotionDiscountType; discountValue: number } | null> {
    const now = new Date();
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { categories: { select: { id: true } } } });
    if (!product) return null;
    const categoryIds = product.categories.map((c) => c.id);

    const validAuto = await this.loadActiveAutomatic(now);
    const { categoryIdsByPromo, productIdsByPromo } = await this.loadScopeData(validAuto);

    const dummyLine: LineItemInput = { productId, variantId: '', quantity: 1, unitPriceCents: 0, categoryIds };

    for (const promo of validAuto) {
      if (this.lineMatchesScope(promo.scope, categoryIdsByPromo.get(promo.id) ?? new Set(), productIdsByPromo.get(promo.id) ?? new Set(), dummyLine)) {
        return { id: promo.id, name: promo.name, discountType: promo.discountType, discountValue: promo.discountValue };
      }
    }
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadActiveAutomatic(now: Date): Promise<ShopPromotion[]> {
    const promos = await this.prisma.shopPromotion.findMany({
      where: { isActive: true, trigger: 'automatic' },
      orderBy: { priority: 'desc' },
    });
    return promos.filter((p) => this.isWithinWindow(p, now) && this.isUnderUsageCap(p));
  }

  private async loadScopeData(promos: ShopPromotion[]): Promise<{
    categoryIdsByPromo: Map<string, Set<string>>;
    productIdsByPromo: Map<string, Set<string>>;
  }> {
    const catPromoIds = promos.filter((p) => p.scope === 'category').map((p) => p.id);
    const prodPromoIds = promos.filter((p) => p.scope === 'product').map((p) => p.id);

    const [catLinks, prodLinks] = await Promise.all([catPromoIds.length ? this.prisma.promotionCategory.findMany({ where: { promotionId: { in: catPromoIds } } }) : Promise.resolve([]), prodPromoIds.length ? this.prisma.promotionProduct.findMany({ where: { promotionId: { in: prodPromoIds } } }) : Promise.resolve([])]);

    const categoryIdsByPromo = new Map<string, Set<string>>();
    for (const l of catLinks) {
      if (!categoryIdsByPromo.has(l.promotionId)) categoryIdsByPromo.set(l.promotionId, new Set());
      categoryIdsByPromo.get(l.promotionId)!.add(l.categoryId);
    }

    const productIdsByPromo = new Map<string, Set<string>>();
    for (const l of prodLinks) {
      if (!productIdsByPromo.has(l.promotionId)) productIdsByPromo.set(l.promotionId, new Set());
      productIdsByPromo.get(l.promotionId)!.add(l.productId);
    }

    return { categoryIdsByPromo, productIdsByPromo };
  }

  private async loadScopeSetsForOne(promo: ShopPromotion): Promise<{ categoryIds: Set<string>; productIds: Set<string> }> {
    if (promo.scope === 'category') {
      const links = await this.prisma.promotionCategory.findMany({ where: { promotionId: promo.id } });
      return { categoryIds: new Set(links.map((l) => l.categoryId)), productIds: new Set() };
    }
    if (promo.scope === 'product') {
      const links = await this.prisma.promotionProduct.findMany({ where: { promotionId: promo.id } });
      return { categoryIds: new Set(), productIds: new Set(links.map((l) => l.productId)) };
    }
    return { categoryIds: new Set(), productIds: new Set() };
  }

  private lineMatchesScope(scope: PromotionScope, categoryIds: Set<string>, productIds: Set<string>, line: LineItemInput): boolean {
    if (scope === 'site_wide') return true;
    if (scope === 'category') return line.categoryIds.some((c) => categoryIds.has(c));
    if (scope === 'product') return productIds.has(line.productId);
    return false;
  }

  private computeDiscount(type: PromotionDiscountType, value: number, baseAmount: number): number {
    if (type === 'percentage') return Math.round((baseAmount * value) / 100);
    if (type === 'fixed_amount') return Math.min(value, baseAmount);
    return 0;
  }

  private isWithinWindow(promo: ShopPromotion, now: Date): boolean {
    return (!promo.startsAt || promo.startsAt <= now) && (!promo.expiresAt || promo.expiresAt >= now);
  }

  private isUnderUsageCap(promo: ShopPromotion): boolean {
    return promo.maxUsesTotal === null || promo.usesCount < promo.maxUsesTotal;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }
}
