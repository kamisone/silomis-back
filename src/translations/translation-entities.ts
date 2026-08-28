/**
 * Canonical `entityType` values for the translations table.
 *
 * These were previously re-declared as string literals in every service that
 * needed them, and one of them drifted: readers looked up
 * `shop_variation_option_value` while the admin wrote `shop_variation_option`,
 * so option-value translations silently never applied anywhere — the storefront
 * fell back to the base language on every product page, cart line and order.
 *
 * A translation lookup that misses returns no rows rather than failing, so a
 * mismatch here is invisible at runtime. Import from this file; never re-type
 * the literal.
 *
 * The admin UI writes these same strings (front: useEntityTranslations), so
 * changing a value here orphans existing rows unless they are migrated too.
 */
export const ET_SHOP_PRODUCT = 'shop_product';
export const ET_SHOP_VARIANT_ATTR = 'shop_variant_attribute';
export const ET_SHOP_VARIATION_OPTION = 'shop_variation_option';
