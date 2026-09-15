-- The shop's own list of what may be posted in for embroidery. Each type is a
-- variant of the hidden send-in product (which carries the price) plus the
-- wizard's and the desk's knowledge of it.
CREATE TABLE "shop_send_in_item_types" (
  "id" TEXT NOT NULL,
  "key" VARCHAR(60) NOT NULL,
  "label" JSONB NOT NULL,
  "hint" JSONB,
  "variantId" TEXT NOT NULL,
  "panelWidthMm" DOUBLE PRECISION NOT NULL,
  "panelHeightMm" DOUBLE PRECISION NOT NULL,
  "maxChars" INTEGER NOT NULL DEFAULT 20,
  "allowPuff" BOOLEAN NOT NULL DEFAULT false,
  "imageKey" VARCHAR(1000),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shop_send_in_item_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shop_send_in_item_types_key_key" ON "shop_send_in_item_types"("key");
CREATE UNIQUE INDEX "shop_send_in_item_types_variantId_key" ON "shop_send_in_item_types"("variantId");
CREATE INDEX "shop_send_in_item_types_isActive_sortOrder_idx" ON "shop_send_in_item_types"("isActive", "sortOrder");
ALTER TABLE "shop_send_in_item_types" ADD CONSTRAINT "shop_send_in_item_types_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "shop_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
