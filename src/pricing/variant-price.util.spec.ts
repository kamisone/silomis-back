import { resolveUnitPriceForQuantity, tierQuantityByProduct, resolveVariantPrice, sumOptionAdjustments } from './variant-price.util';

const TIERS = [
  { quantity: 2, unitPriceCents: 1800, active: true },
  { quantity: 3, unitPriceCents: 1500, active: true },
  { quantity: 5, unitPriceCents: 1200, active: false },
];
const UPSELL = { upsellingEnabled: true, upsellTiers: TIERS };
const PRICE = { variantPriceCents: 2000, basePriceCents: null, optionAdjustmentCents: 0 };

describe('resolveVariantPrice', () => {
  it('prefers an explicit variant price over the computed one', () => {
    expect(resolveVariantPrice({ variantPriceCents: 900, basePriceCents: 100, optionAdjustmentCents: 50 })).toBe(900);
  });

  it('computes base plus option adjustments when there is no override', () => {
    expect(resolveVariantPrice({ variantPriceCents: null, basePriceCents: 1000, optionAdjustmentCents: 250 })).toBe(1250);
  });

  it('sums adjustments, treating a missing one as zero', () => {
    expect(sumOptionAdjustments([{ optionValue: { priceAdjustmentCents: 100 } }, { optionValue: null }, {}])).toBe(100);
  });
});

describe('resolveUnitPriceForQuantity', () => {
  it('charges the ordinary price below every threshold', () => {
    expect(resolveUnitPriceForQuantity(PRICE, 1, UPSELL)).toBe(2000);
  });

  it('applies the highest tier the quantity reaches', () => {
    expect(resolveUnitPriceForQuantity(PRICE, 2, UPSELL)).toBe(1800);
    expect(resolveUnitPriceForQuantity(PRICE, 3, UPSELL)).toBe(1500);
    expect(resolveUnitPriceForQuantity(PRICE, 4, UPSELL)).toBe(1500);
  });

  it('ignores an inactive tier even when the quantity reaches it', () => {
    expect(resolveUnitPriceForQuantity(PRICE, 6, UPSELL)).toBe(1500);
  });

  it('ignores tiers entirely when upselling is off', () => {
    expect(resolveUnitPriceForQuantity(PRICE, 5, { upsellingEnabled: false, upsellTiers: TIERS })).toBe(2000);
  });
});

describe('tierQuantityByProduct', () => {
  it('sums a product split across several variant lines', () => {
    // Three shirts in three sizes must qualify exactly as 3x one size would.
    const totals = tierQuantityByProduct([
      { productId: 'shirt', quantity: 2 },
      { productId: 'shirt', quantity: 1 },
    ]);

    expect(totals.get('shirt')).toBe(3);
    expect(resolveUnitPriceForQuantity(PRICE, totals.get('shirt')!, UPSELL)).toBe(1500);
  });

  it('keeps products separate', () => {
    const totals = tierQuantityByProduct([
      { productId: 'shirt', quantity: 2 },
      { productId: 'mug', quantity: 4 },
    ]);

    expect(totals.get('shirt')).toBe(2);
    expect(totals.get('mug')).toBe(4);
  });

  it('is empty for an empty cart', () => {
    expect(tierQuantityByProduct([]).size).toBe(0);
  });

  it('would under-price nothing: per-line resolution loses the tier a split basket earns', () => {
    // Guards the whole reason this helper exists — resolving 2+1 per line gives
    // no tier at all, while the customer was shown the "buy 3" price.
    const perLine = [2, 1].map((q) => resolveUnitPriceForQuantity(PRICE, q, UPSELL));
    expect(perLine).toEqual([1800, 2000]);

    const combined = resolveUnitPriceForQuantity(PRICE, 3, UPSELL);
    expect(combined).toBe(1500);
  });
});
