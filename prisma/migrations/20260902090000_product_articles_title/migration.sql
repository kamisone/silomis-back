-- Heading over the articles linked to a product, shown at the foot of its page.
-- Nullable: an unset title falls back to the storefront's own translated string,
-- so existing products need no backfill. Per-language values live in the
-- translations table against entity `shop_product`, field `articlesTitle`, the
-- same way socialVideosTitle already works.
ALTER TABLE "shop_products" ADD COLUMN "articlesTitle" VARCHAR(300);
