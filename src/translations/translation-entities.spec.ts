import { ET_SHOP_PRODUCT, ET_SHOP_VARIANT_ATTR, ET_SHOP_VARIATION_OPTION } from './translation-entities';

/**
 * These strings are a cross-repo contract: the admin UI writes rows under them
 * (front/src/app/admin/shop/variant-attributes/page.tsx passes them to
 * useEntityTranslations) and the storefront reads rows back with them.
 *
 * A mismatch is silent — a lookup that finds nothing returns no rows and the
 * caller falls back to the base language — which is exactly how
 * `shop_variation_option_value` went unnoticed on the reading side while every
 * stored row used `shop_variation_option`.
 *
 * If one of these has to change, migrate the existing translations rows in the
 * same commit.
 */
describe('translation entity types', () => {
  it('matches the values the admin UI writes', () => {
    expect(ET_SHOP_PRODUCT).toBe('shop_product');
    expect(ET_SHOP_VARIANT_ATTR).toBe('shop_variant_attribute');
    expect(ET_SHOP_VARIATION_OPTION).toBe('shop_variation_option');
  });

  it('does not use the stale option-value spelling', () => {
    // Reading under this name found nothing, so no option value was ever
    // translated on the storefront.
    expect(ET_SHOP_VARIATION_OPTION).not.toBe('shop_variation_option_value');
  });
});
