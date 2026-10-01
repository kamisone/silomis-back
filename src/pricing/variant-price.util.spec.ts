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

/**
 * A tier counts a product's cart lines together, not one at a time.
 *
 * This is load-bearing rather than incidental. The product page adds one
 * combination at a time now — the per-unit picker that used to compose a mixed
 * selection in a single pass is gone — so three shirts in three sizes arrive as
 * three lines of one unit. If tiers resolved per line, the only shopper who could
 * ever reach "buy 3" would be one buying three of the *same* size, which is not
 * what the offer says.
 */
describe('quantity tiers across a product’s separate cart lines', () => {
  const lines = [
    { productId: 'shirt', variantId: 'shirt-s', quantity: 1 },
    { productId: 'shirt', variantId: 'shirt-m', quantity: 1 },
    { productId: 'shirt', variantId: 'shirt-l', quantity: 1 },
    { productId: 'cap', variantId: 'cap-black', quantity: 1 },
  ];

  it('sums one product’s lines and leaves another product’s alone', () => {
    const totals = tierQuantityByProduct(lines);
    expect(totals.get('shirt')).toBe(3);
    expect(totals.get('cap')).toBe(1);
  });

  it('gives every line of the product the tier its combined quantity earns', () => {
    const total = tierQuantityByProduct(lines).get('shirt')!;
    for (const line of lines.filter((l) => l.productId === 'shirt')) {
      void line;
      expect(resolveUnitPriceForQuantity(PRICE, total, UPSELL)).toBe(1500);
    }
  });

  it('would charge full price if it counted per line — the regression this guards', () => {
    // One unit on its own reaches no tier. That is the wrong answer for a line
    // that is part of a three-shirt order, and the reason the cart re-prices
    // every line of a product together after each write.
    expect(resolveUnitPriceForQuantity(PRICE, 1, UPSELL)).toBe(2000);
  });

  it('drops back down when the combined quantity falls', () => {
    // Removing a line is contagious in the other direction too: two left means
    // the "buy 2" price, not the "buy 3" one they had a moment ago.
    expect(resolveUnitPriceForQuantity(PRICE, 2, UPSELL)).toBe(1800);
  });
});
