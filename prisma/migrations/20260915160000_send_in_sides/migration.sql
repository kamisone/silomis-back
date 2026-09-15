-- Several sides per item, each with its own photo, design and handling fee.
ALTER TABLE "shop_send_in_item_types" ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shop_send_in_jobs" ADD COLUMN "sides" JSONB NOT NULL DEFAULT '[]';

-- The fee moves from the variant (charged once per line) to the item type
-- (charged once per side); the variant stays only for checkout's sake, at zero.
UPDATE "shop_send_in_item_types" t
SET "priceCents" = COALESCE(v."priceCents", 0)
FROM "shop_product_variants" v
WHERE v."id" = t."variantId";

UPDATE "shop_product_variants" v
SET "priceCents" = 0
FROM "shop_send_in_item_types" t
WHERE v."id" = t."variantId";

-- Existing jobs: their one photo becomes their one side.
UPDATE "shop_send_in_jobs"
SET "sides" = jsonb_build_array(jsonb_build_object(
  'placementKey', 'item',
  'sideLabel', 'front',
  'photoKey', "photoKeys"[1],
  'mockupKey', "mockupKey"
))
WHERE array_length("photoKeys", 1) >= 1;
