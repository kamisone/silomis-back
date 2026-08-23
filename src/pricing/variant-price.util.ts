/**
 * Three-tier variant pricing model.
 *
 * Tier 1 — Variant override: variant.priceCents (explicit, wins everything)
 * Tier 2 — Computed price:   product.basePriceCents + sum(option adjustments)
 */

export interface VariantPriceComponents {
  /** Per-variant explicit price. When non-null, wins over everything else. */
  variantPriceCents: number | null;
  /** Product-level base price from which option adjustments are computed. */
  basePriceCents: number | null;
  /** Pre-summed adjustments from all selected VariationOptionValues. */
  optionAdjustmentCents: number;
}

export function resolveVariantPrice(c: VariantPriceComponents): number {
  if (c.variantPriceCents !== null) return c.variantPriceCents;
  const computed = (c.basePriceCents ?? 0) + c.optionAdjustmentCents;
  if (computed < 0) {
    throw new Error(`Resolved variant price is negative (${computed}): basePriceCents=${c.basePriceCents}, optionAdjustmentCents=${c.optionAdjustmentCents}`);
  }
  return computed;
}

/** Sums priceAdjustmentCents from an array of VariantOption-like objects. Null/missing adjustments contribute 0. */
export function sumOptionAdjustments(options: Array<{ optionValue?: { priceAdjustmentCents?: number | null } | null }>): number {
  return (options ?? []).reduce((sum, o) => sum + (o.optionValue?.priceAdjustmentCents ?? 0), 0);
}

// ── Quantity-based upselling ("buy N, pay X each") ──────────────────────

export interface UpsellTierLike {
  quantity: number;
  unitPriceCents: number;
  active: boolean;
}

export interface UpsellConfig {
  upsellingEnabled: boolean;
  upsellTiers: UpsellTierLike[] | null | undefined;
}

/**
 * Layers quantity-tier pricing on top of the three-tier variant model. A
 * matching tier is a *flat* unit price that replaces the variant/option-
 * resolved price entirely (it is not a discount on top of it) — the highest
 * tier whose `quantity` threshold `quantity` meets or exceeds wins.
 *
 * This is the ONLY place quantity affects unit price. Every write path that
 * persists or verifies a cart line's `unitPriceCents` (cart add/update,
 * checkout price re-verification) must go through this function.
 */
export function resolveUnitPriceForQuantity(components: VariantPriceComponents, quantity: number, upsell: UpsellConfig | null | undefined): number {
  const basePrice = resolveVariantPrice(components);
  if (!upsell?.upsellingEnabled || !upsell.upsellTiers?.length) return basePrice;

  const bestTier = upsell.upsellTiers.filter((t) => t.active && Number.isInteger(t.quantity) && t.quantity <= quantity).sort((a, b) => b.quantity - a.quantity)[0];

  return bestTier ? bestTier.unitPriceCents : basePrice;
}
