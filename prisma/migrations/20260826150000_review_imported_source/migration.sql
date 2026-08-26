-- Admin-entered reviews sourced from a supplier listing have no customer
-- behind them, so there is no address to store.
ALTER TABLE "shop_product_reviews" ALTER COLUMN "authorEmail" DROP NOT NULL;

-- Existing rows all came through the storefront submit flow.
ALTER TABLE "shop_product_reviews" ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE "shop_product_reviews" ADD COLUMN "sourceUrl" VARCHAR(1000);

CREATE INDEX "shop_product_reviews_source_idx" ON "shop_product_reviews"("source");
