-- A position now carries its own photograph and tracing, instead of one per
-- product. "Front panel" is the front panel — photographed once, not re-uploaded
-- for every cap — so the per-product table goes and its contents move up.

-- DropForeignKey
ALTER TABLE "shop_product_placement_views" DROP CONSTRAINT "shop_product_placement_views_placementId_fkey";

-- DropForeignKey
ALTER TABLE "shop_product_placement_views" DROP CONSTRAINT "shop_product_placement_views_productId_fkey";

-- AlterTable
ALTER TABLE "shop_personalization_placements" ADD COLUMN     "bottomLeftXPct" DOUBLE PRECISION NOT NULL DEFAULT 34,
ADD COLUMN     "bottomLeftYPct" DOUBLE PRECISION NOT NULL DEFAULT 57,
ADD COLUMN     "bottomRightXPct" DOUBLE PRECISION NOT NULL DEFAULT 66,
ADD COLUMN     "bottomRightYPct" DOUBLE PRECISION NOT NULL DEFAULT 57,
ADD COLUMN     "isTraced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaKey" VARCHAR(1000),
ADD COLUMN     "topLeftXPct" DOUBLE PRECISION NOT NULL DEFAULT 34,
ADD COLUMN     "topLeftYPct" DOUBLE PRECISION NOT NULL DEFAULT 42,
ADD COLUMN     "topRightXPct" DOUBLE PRECISION NOT NULL DEFAULT 66,
ADD COLUMN     "topRightYPct" DOUBLE PRECISION NOT NULL DEFAULT 42;

-- Carry the photographs up before the table goes.
--
-- A position had one row per product; it now has one photo of its own. Where a
-- position was set up on several products they were all shots of the same view
-- of the same kind of item, so the earliest is taken and the rest discarded —
-- there is no merge to do, and losing the admin's work to a DROP would be the
-- worse outcome.
UPDATE "shop_personalization_placements" p
SET "mediaKey"        = v."mediaKey",
    "topLeftXPct"     = v."topLeftXPct",
    "topLeftYPct"     = v."topLeftYPct",
    "topRightXPct"    = v."topRightXPct",
    "topRightYPct"    = v."topRightYPct",
    "bottomRightXPct" = v."bottomRightXPct",
    "bottomRightYPct" = v."bottomRightYPct",
    "bottomLeftXPct"  = v."bottomLeftXPct",
    "bottomLeftYPct"  = v."bottomLeftYPct",
    "isTraced"        = v."isTraced"
FROM (
  SELECT DISTINCT ON ("placementId") *
  FROM "shop_product_placement_views"
  ORDER BY "placementId", "createdAt" ASC
) v
WHERE v."placementId" = p.id;

-- DropTable
DROP TABLE "shop_product_placement_views";

