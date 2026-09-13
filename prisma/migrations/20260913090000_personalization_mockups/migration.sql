-- AlterTable
ALTER TABLE "shop_cart_item_personalizations" ADD COLUMN     "offsetXMm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "offsetYMm" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "shop_order_item_personalizations" ADD COLUMN     "offsetXMm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "offsetYMm" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shop_product_mockups" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "mediaKey" VARCHAR(1000) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_mockups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_mockup_zones" (
    "id" TEXT NOT NULL,
    "mockupId" TEXT NOT NULL,
    "placementKey" VARCHAR(60) NOT NULL,
    "topLeftXPct" DOUBLE PRECISION NOT NULL,
    "topLeftYPct" DOUBLE PRECISION NOT NULL,
    "topRightXPct" DOUBLE PRECISION NOT NULL,
    "topRightYPct" DOUBLE PRECISION NOT NULL,
    "bottomRightXPct" DOUBLE PRECISION NOT NULL,
    "bottomRightYPct" DOUBLE PRECISION NOT NULL,
    "bottomLeftXPct" DOUBLE PRECISION NOT NULL,
    "bottomLeftYPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "shop_product_mockup_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_product_mockups_productId_sortOrder_idx" ON "shop_product_mockups"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_mockups_productId_key_key" ON "shop_product_mockups"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_mockup_zones_mockupId_placementKey_key" ON "shop_product_mockup_zones"("mockupId", "placementKey");

-- AddForeignKey
ALTER TABLE "shop_product_mockups" ADD CONSTRAINT "shop_product_mockups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_mockup_zones" ADD CONSTRAINT "shop_product_mockup_zones_mockupId_fkey" FOREIGN KEY ("mockupId") REFERENCES "shop_product_mockups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

