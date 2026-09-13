-- Placements become admin data: named in every language, priced individually,
-- and each carrying its own photograph per product. A customer can now
-- personalise several positions on one item and pay for each.
--
-- shop_product_mockups / _zones are dropped rather than migrated: they modelled
-- "one photo, many placements traced on it", which the new shape inverts to
-- "one placement, its own photo". Nothing in production depended on them.

-- DropForeignKey
ALTER TABLE "shop_product_mockup_zones" DROP CONSTRAINT "shop_product_mockup_zones_mockupId_fkey";

-- DropForeignKey
ALTER TABLE "shop_product_mockups" DROP CONSTRAINT "shop_product_mockups_productId_fkey";

-- DropIndex
DROP INDEX "shop_cart_item_personalizations_cartItemId_key";

-- DropIndex
DROP INDEX "shop_order_item_personalizations_orderItemId_key";

-- AlterTable: placements become admin-managed, with localized names and their
-- own price.
--
-- Written by hand rather than taken from `migrate diff`, which wanted to DROP
-- and re-ADD `label` as JSONB — that both destroys every existing name and
-- fails outright on a non-empty table, since the new column is NOT NULL with
-- no default. Converting in place keeps the seeded names as the English entry
-- of the new map, which is exactly where they belong.
ALTER TABLE "shop_personalization_placements"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0;

-- The old surcharge was the same idea under a narrower name, so it becomes the
-- position's price rather than being thrown away.
UPDATE "shop_personalization_placements" SET "priceCents" = "surchargeCents";
ALTER TABLE "shop_personalization_placements" DROP COLUMN "surchargeCents";

ALTER TABLE "shop_personalization_placements"
  ALTER COLUMN "label" TYPE JSONB USING jsonb_build_object('en', "label"),
  ALTER COLUMN "hint"  TYPE JSONB USING CASE WHEN "hint" IS NULL THEN NULL ELSE jsonb_build_object('en', "hint") END;

ALTER TABLE "shop_personalization_placements"
  ALTER COLUMN "previewXPct" SET DEFAULT 34,
  ALTER COLUMN "previewYPct" SET DEFAULT 42,
  ALTER COLUMN "previewWidthPct" SET DEFAULT 32,
  ALTER COLUMN "previewHeightPct" SET DEFAULT 15;

-- DropTable
DROP TABLE "shop_product_mockup_zones";

-- DropTable
DROP TABLE "shop_product_mockups";

-- CreateTable
CREATE TABLE "shop_product_placement_views" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "mediaKey" VARCHAR(1000) NOT NULL,
    "topLeftXPct" DOUBLE PRECISION NOT NULL DEFAULT 34,
    "topLeftYPct" DOUBLE PRECISION NOT NULL DEFAULT 42,
    "topRightXPct" DOUBLE PRECISION NOT NULL DEFAULT 66,
    "topRightYPct" DOUBLE PRECISION NOT NULL DEFAULT 42,
    "bottomRightXPct" DOUBLE PRECISION NOT NULL DEFAULT 66,
    "bottomRightYPct" DOUBLE PRECISION NOT NULL DEFAULT 57,
    "bottomLeftXPct" DOUBLE PRECISION NOT NULL DEFAULT 34,
    "bottomLeftYPct" DOUBLE PRECISION NOT NULL DEFAULT 57,
    "isTraced" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_placement_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_product_placement_views_productId_sortOrder_idx" ON "shop_product_placement_views"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_placement_views_productId_placementId_key" ON "shop_product_placement_views"("productId", "placementId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_cart_item_personalizations_cartItemId_placementKey_key" ON "shop_cart_item_personalizations"("cartItemId", "placementKey");

-- CreateIndex
CREATE UNIQUE INDEX "shop_order_item_personalizations_orderItemId_placementKey_key" ON "shop_order_item_personalizations"("orderItemId", "placementKey");

-- AddForeignKey
ALTER TABLE "shop_product_placement_views" ADD CONSTRAINT "shop_product_placement_views_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_placement_views" ADD CONSTRAINT "shop_product_placement_views_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "shop_personalization_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

