-- Positions move from the shop-wide template to the product they belong to.
--
-- They have to: each position carries the photograph a customer places artwork
-- on, and a cap's front panel is that cap's photo. A beanie has no peak to be
-- above, so a shop selling both cannot share one list between them.
--
-- Hand-written rather than taken from `migrate diff`, which wanted to add
-- `productId` as NOT NULL on a populated table (it fails outright) and to drop
-- `templateId` before anything could use it to work out which product each
-- position belonged to.

-- CarryOver: a nullable column first, so existing rows survive to be filled in.
ALTER TABLE "shop_personalization_placements" ADD COLUMN "productId" TEXT;

-- The first product using each template keeps the original rows, ids and all.
UPDATE "shop_personalization_placements" p
SET "productId" = first."productId"
FROM (
  SELECT DISTINCT ON (pr."personalizationTemplateId")
         pr."personalizationTemplateId" AS "templateId",
         pr.id                          AS "productId"
  FROM "shop_products" pr
  WHERE pr."personalizationTemplateId" IS NOT NULL
  ORDER BY pr."personalizationTemplateId", pr."createdAt" ASC
) first
WHERE first."templateId" = p."templateId";

-- Every other product on that template gets its own copy, so nobody loses a
-- position they had set up. The photo and tracing come along; from here the
-- two are independent and can diverge, which is the point of the change.
INSERT INTO "shop_personalization_placements" (
  "id", "productId", "key", "label", "hint",
  "fieldWidthMm", "fieldHeightMm", "maxColors", "maxChars", "priceCents",
  "mediaKey", "isTraced",
  "topLeftXPct", "topLeftYPct", "topRightXPct", "topRightYPct",
  "bottomRightXPct", "bottomRightYPct", "bottomLeftXPct", "bottomLeftYPct",
  "previewXPct", "previewYPct", "previewWidthPct", "previewHeightPct", "previewRotateDeg",
  "isActive", "sortOrder", "createdAt", "updatedAt", "templateId"
)
SELECT
  gen_random_uuid(), pr.id, p."key", p."label", p."hint",
  p."fieldWidthMm", p."fieldHeightMm", p."maxColors", p."maxChars", p."priceCents",
  p."mediaKey", p."isTraced",
  p."topLeftXPct", p."topLeftYPct", p."topRightXPct", p."topRightYPct",
  p."bottomRightXPct", p."bottomRightYPct", p."bottomLeftXPct", p."bottomLeftYPct",
  p."previewXPct", p."previewYPct", p."previewWidthPct", p."previewHeightPct", p."previewRotateDeg",
  p."isActive", p."sortOrder", p."createdAt", p."updatedAt", p."templateId"
FROM "shop_personalization_placements" p
JOIN "shop_products" pr ON pr."personalizationTemplateId" = p."templateId"
WHERE p."productId" IS NOT NULL AND pr.id <> p."productId";

-- A template no product uses leaves positions with nowhere to belong.
DELETE FROM "shop_personalization_placements" WHERE "productId" IS NULL;

ALTER TABLE "shop_personalization_placements" ALTER COLUMN "productId" SET NOT NULL;

-- AlterTable: the hoop field is snapshotted onto the design from now on, so a
-- position resized later cannot redraw a sheet for a job already sold.
ALTER TABLE "shop_cart_item_personalizations"
  ADD COLUMN "fieldWidthMm" DOUBLE PRECISION NOT NULL DEFAULT 100,
  ADD COLUMN "fieldHeightMm" DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "shop_order_item_personalizations"
  ADD COLUMN "fieldWidthMm" DOUBLE PRECISION NOT NULL DEFAULT 100,
  ADD COLUMN "fieldHeightMm" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- Backfill the existing ones from the position they were made against, so old
-- sheets keep printing at the size they were drawn at rather than the default.
UPDATE "shop_order_item_personalizations" d
SET "fieldWidthMm" = k."fieldWidthMm", "fieldHeightMm" = k."fieldHeightMm"
FROM (SELECT DISTINCT ON ("key") "key", "fieldWidthMm", "fieldHeightMm"
      FROM "shop_personalization_placements" ORDER BY "key", "createdAt" ASC) k
WHERE k."key" = d."placementKey";

UPDATE "shop_cart_item_personalizations" d
SET "fieldWidthMm" = k."fieldWidthMm", "fieldHeightMm" = k."fieldHeightMm"
FROM (SELECT DISTINCT ON ("key") "key", "fieldWidthMm", "fieldHeightMm"
      FROM "shop_personalization_placements" ORDER BY "key", "createdAt" ASC) k
WHERE k."key" = d."placementKey";

-- DropForeignKey / DropIndex / DropColumn
ALTER TABLE "shop_personalization_placements" DROP CONSTRAINT "shop_personalization_placements_templateId_fkey";
DROP INDEX "shop_personalization_placements_templateId_isActive_sortOrd_idx";
DROP INDEX "shop_personalization_placements_templateId_key_key";
ALTER TABLE "shop_personalization_placements" DROP COLUMN "templateId";

-- CreateIndex
CREATE INDEX "shop_personalization_placements_productId_isActive_sortOrde_idx" ON "shop_personalization_placements"("productId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "shop_personalization_placements_productId_key_key" ON "shop_personalization_placements"("productId", "key");

-- AddForeignKey
ALTER TABLE "shop_personalization_placements" ADD CONSTRAINT "shop_personalization_placements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
