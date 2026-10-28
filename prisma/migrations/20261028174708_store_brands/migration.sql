-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "storeBrandId" TEXT;

-- AlterTable
ALTER TABLE "shop_products" ADD COLUMN     "storeBrandId" TEXT;

-- CreateTable
CREATE TABLE "shop_store_brands" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tagline" VARCHAR(200),
    "logoKey" VARCHAR(1000),
    "iconKey" VARCHAR(1000),
    "footerText" TEXT,
    "supportEmail" VARCHAR(300),
    "supportPhone" VARCHAR(50),
    "aboutTitle" VARCHAR(300),
    "aboutHtml" TEXT,
    "contactIntro" TEXT,
    "returnsNote" TEXT,
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "seoTitle" VARCHAR(300),
    "seoDescription" TEXT,
    "shareImageKey" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_store_brands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_store_brands_slug_key" ON "shop_store_brands"("slug");

-- CreateIndex
CREATE INDEX "shop_orders_storeBrandId_idx" ON "shop_orders"("storeBrandId");

-- CreateIndex
CREATE INDEX "shop_products_storeBrandId_idx" ON "shop_products"("storeBrandId");

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_storeBrandId_fkey" FOREIGN KEY ("storeBrandId") REFERENCES "shop_store_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_storeBrandId_fkey" FOREIGN KEY ("storeBrandId") REFERENCES "shop_store_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
