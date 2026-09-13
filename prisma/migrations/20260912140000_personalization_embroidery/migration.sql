-- CreateEnum
CREATE TYPE "PersonalizationContentType" AS ENUM ('text', 'monogram');

-- DropIndex
DROP INDEX "shop_cart_items_cartId_variantId_key";

-- AlterTable
ALTER TABLE "shop_cart_items" ADD COLUMN     "personalizationCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "personalizationHash" VARCHAR(64) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "shop_order_items" ADD COLUMN     "personalizationCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "shop_products" ADD COLUMN     "personalizationTemplateId" TEXT;

-- CreateTable
CREATE TABLE "shop_embroidery_fonts" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "webFamily" VARCHAR(300) NOT NULL,
    "minHeightMm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "maxHeightMm" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "stitchesPerCharAt10mm" INTEGER NOT NULL DEFAULT 140,
    "avgCharWidthRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.62,
    "uppercaseOnly" BOOLEAN NOT NULL DEFAULT false,
    "supportsMonogram" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_embroidery_fonts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_thread_colors" (
    "id" TEXT NOT NULL,
    "brand" VARCHAR(120) NOT NULL DEFAULT 'Madeira Polyneon',
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "hex" VARCHAR(7) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_thread_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_personalization_templates" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "allowText" BOOLEAN NOT NULL DEFAULT true,
    "allowMonogram" BOOLEAN NOT NULL DEFAULT true,
    "allowUpload" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_personalization_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_personalization_placements" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "hint" VARCHAR(300),
    "fieldWidthMm" DOUBLE PRECISION NOT NULL,
    "fieldHeightMm" DOUBLE PRECISION NOT NULL,
    "maxColors" INTEGER NOT NULL DEFAULT 3,
    "maxChars" INTEGER NOT NULL DEFAULT 12,
    "previewXPct" DOUBLE PRECISION NOT NULL,
    "previewYPct" DOUBLE PRECISION NOT NULL,
    "previewWidthPct" DOUBLE PRECISION NOT NULL,
    "previewHeightPct" DOUBLE PRECISION NOT NULL,
    "previewRotateDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "surchargeCents" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_personalization_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_personalization_price_bands" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "maxStitches" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "label" VARCHAR(160),

    CONSTRAINT "shop_personalization_price_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_cart_item_personalizations" (
    "id" TEXT NOT NULL,
    "cartItemId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "placementKey" VARCHAR(60) NOT NULL,
    "placementLabel" VARCHAR(160) NOT NULL,
    "contentType" "PersonalizationContentType" NOT NULL,
    "text" VARCHAR(60) NOT NULL,
    "fontKey" VARCHAR(80) NOT NULL,
    "fontName" VARCHAR(200) NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "threadColors" JSONB NOT NULL,
    "stitchEstimate" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "designJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_cart_item_personalizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_item_personalizations" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "placementKey" VARCHAR(60) NOT NULL,
    "placementLabel" VARCHAR(160) NOT NULL,
    "contentType" "PersonalizationContentType" NOT NULL,
    "text" VARCHAR(60) NOT NULL,
    "fontKey" VARCHAR(80) NOT NULL,
    "fontName" VARCHAR(200) NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "threadColors" JSONB NOT NULL,
    "stitchEstimate" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "designJson" JSONB NOT NULL,
    "productionSvg" TEXT,
    "productionStatus" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "stitchFileKey" VARCHAR(1000),
    "digitizedAt" TIMESTAMP(3),
    "productionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_order_item_personalizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_embroidery_fonts_key_key" ON "shop_embroidery_fonts"("key");

-- CreateIndex
CREATE INDEX "shop_embroidery_fonts_isActive_sortOrder_idx" ON "shop_embroidery_fonts"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "shop_thread_colors_isActive_sortOrder_idx" ON "shop_thread_colors"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shop_thread_colors_brand_code_key" ON "shop_thread_colors"("brand", "code");

-- CreateIndex
CREATE UNIQUE INDEX "shop_personalization_templates_key_key" ON "shop_personalization_templates"("key");

-- CreateIndex
CREATE INDEX "shop_personalization_placements_templateId_isActive_sortOrd_idx" ON "shop_personalization_placements"("templateId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shop_personalization_placements_templateId_key_key" ON "shop_personalization_placements"("templateId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "shop_personalization_price_bands_templateId_maxStitches_key" ON "shop_personalization_price_bands"("templateId", "maxStitches");

-- CreateIndex
CREATE UNIQUE INDEX "shop_cart_item_personalizations_cartItemId_key" ON "shop_cart_item_personalizations"("cartItemId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_order_item_personalizations_orderItemId_key" ON "shop_order_item_personalizations"("orderItemId");

-- CreateIndex
CREATE INDEX "shop_order_item_personalizations_productionStatus_idx" ON "shop_order_item_personalizations"("productionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "shop_cart_items_cartId_variantId_personalizationHash_key" ON "shop_cart_items"("cartId", "variantId", "personalizationHash");

-- CreateIndex
CREATE INDEX "shop_products_personalizationTemplateId_idx" ON "shop_products"("personalizationTemplateId");

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_personalizationTemplateId_fkey" FOREIGN KEY ("personalizationTemplateId") REFERENCES "shop_personalization_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_personalization_placements" ADD CONSTRAINT "shop_personalization_placements_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "shop_personalization_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_personalization_price_bands" ADD CONSTRAINT "shop_personalization_price_bands_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "shop_personalization_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_cart_item_personalizations" ADD CONSTRAINT "shop_cart_item_personalizations_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "shop_cart_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_item_personalizations" ADD CONSTRAINT "shop_order_item_personalizations_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "shop_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

