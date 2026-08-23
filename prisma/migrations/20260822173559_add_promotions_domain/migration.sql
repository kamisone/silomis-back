-- CreateEnum
CREATE TYPE "PromotionTrigger" AS ENUM ('automatic', 'coupon');

-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('site_wide', 'category', 'product');

-- CreateEnum
CREATE TYPE "PromotionDiscountType" AS ENUM ('percentage', 'fixed_amount', 'free_shipping');

-- CreateTable
CREATE TABLE "shop_promotions" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "trigger" "PromotionTrigger" NOT NULL DEFAULT 'automatic',
    "code" VARCHAR(100),
    "discountType" "PromotionDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "scope" "PromotionScope" NOT NULL DEFAULT 'site_wide',
    "minOrderCents" INTEGER,
    "maxUsesTotal" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_promotion_categories" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "shop_promotion_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_promotion_products" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "shop_promotion_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_promotions_code_key" ON "shop_promotions"("code");

-- CreateIndex
CREATE INDEX "shop_promotions_trigger_isActive_idx" ON "shop_promotions"("trigger", "isActive");

-- CreateIndex
CREATE INDEX "shop_promotions_scope_idx" ON "shop_promotions"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "shop_promotion_categories_promotionId_categoryId_key" ON "shop_promotion_categories"("promotionId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_promotion_products_promotionId_productId_key" ON "shop_promotion_products"("promotionId", "productId");

-- AddForeignKey
ALTER TABLE "shop_promotion_categories" ADD CONSTRAINT "shop_promotion_categories_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "shop_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_promotion_categories" ADD CONSTRAINT "shop_promotion_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop_product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_promotion_products" ADD CONSTRAINT "shop_promotion_products_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "shop_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_promotion_products" ADD CONSTRAINT "shop_promotion_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
