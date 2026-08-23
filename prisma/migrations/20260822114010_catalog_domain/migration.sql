-- CreateEnum
CREATE TYPE "VariantDisplayType" AS ENUM ('swatch', 'button', 'dropdown');

-- CreateEnum
CREATE TYPE "SwatchType" AS ENUM ('color', 'image');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'archived', 'out_of_stock', 'hidden');

-- CreateTable
CREATE TABLE "shop_product_categories" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "seoTitle" VARCHAR(300),
    "seoDescription" TEXT,
    "imageKey" VARCHAR(1000),
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_tags" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,

    CONSTRAINT "shop_product_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_variant_attributes" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "adminLabel" VARCHAR(200),
    "categoryId" TEXT,
    "displayType" "VariantDisplayType" NOT NULL DEFAULT 'button',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shop_variant_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_variation_option_values" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "displayValue" VARCHAR(200),
    "swatchValue" VARCHAR(500),
    "swatchType" "SwatchType",
    "priceAdjustmentCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shop_variation_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(300) NOT NULL,
    "sku" VARCHAR(200),
    "title" VARCHAR(500) NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "featuredImageKey" VARCHAR(1000),
    "featuredImageAlt" VARCHAR(500),
    "galleryImageKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media" JSONB NOT NULL DEFAULT '[]',
    "brand" VARCHAR(300),
    "specifications" JSONB,
    "infoSections" JSONB NOT NULL DEFAULT '[]',
    "trustBadges" JSONB NOT NULL DEFAULT '[]',
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "zoomedImages" JSONB NOT NULL DEFAULT '[]',
    "packageContents" JSONB NOT NULL DEFAULT '[]',
    "storyGallery" JSONB NOT NULL DEFAULT '[]',
    "socialVideos" JSONB NOT NULL DEFAULT '[]',
    "socialVideosTitle" VARCHAR(300),
    "storyNarrativeTitle" VARCHAR(300),
    "documents" JSONB NOT NULL DEFAULT '[]',
    "privateLinks" JSONB NOT NULL DEFAULT '[]',
    "seoTitle" VARCHAR(500),
    "seoDescription" TEXT,
    "canonicalUrl" VARCHAR(2000),
    "basePriceCents" INTEGER,
    "upsellingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "upsellTiers" JSONB NOT NULL DEFAULT '[]',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "isTestProduct" BOOLEAN NOT NULL DEFAULT false,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "freeShippingDaysMin" INTEGER,
    "freeShippingDaysMax" INTEGER,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "ratingAverage" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "ratingDistribution" JSONB NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}',
    "vendorId" TEXT,
    "primaryCategoryId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" VARCHAR(200) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "priceCents" INTEGER,
    "compareAtPriceCents" INTEGER,
    "barcode" VARCHAR(200),
    "weightGrams" INTEGER,
    "dimensions" JSONB,
    "mediaKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featuredMediaKey" VARCHAR(1000),
    "combinationHash" VARCHAR(300),
    "variantSlug" VARCHAR(300),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_variant_options" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "optionValueId" TEXT,
    "value" VARCHAR(500) NOT NULL,

    CONSTRAINT "shop_variant_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_variant_attributes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultOptionValueId" TEXT,

    CONSTRAINT "shop_product_variant_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_option_value_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,
    "mediaKey" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_option_value_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_inventory_items" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "reorderThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProductCategoryMap" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductCategoryMap_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProductTagMap" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductTagMap_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_categories_slug_key" ON "shop_product_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_tags_name_key" ON "shop_product_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_tags_slug_key" ON "shop_product_tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "shop_variant_attributes_adminLabel_key" ON "shop_variant_attributes"("adminLabel");

-- CreateIndex
CREATE INDEX "shop_variant_attributes_categoryId_idx" ON "shop_variant_attributes"("categoryId");

-- CreateIndex
CREATE INDEX "shop_variant_attributes_displayType_idx" ON "shop_variant_attributes"("displayType");

-- CreateIndex
CREATE UNIQUE INDEX "shop_variation_option_values_attributeId_value_key" ON "shop_variation_option_values"("attributeId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_slug_key" ON "shop_products"("slug");

-- CreateIndex
CREATE INDEX "shop_products_status_idx" ON "shop_products"("status");

-- CreateIndex
CREATE INDEX "shop_products_featured_idx" ON "shop_products"("featured");

-- CreateIndex
CREATE INDEX "shop_products_isTestProduct_idx" ON "shop_products"("isTestProduct");

-- CreateIndex
CREATE INDEX "shop_products_freeShipping_idx" ON "shop_products"("freeShipping");

-- CreateIndex
CREATE INDEX "shop_products_primaryCategoryId_idx" ON "shop_products"("primaryCategoryId");

-- CreateIndex
CREATE INDEX "shop_products_vendorId_idx" ON "shop_products"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_variants_sku_key" ON "shop_product_variants"("sku");

-- CreateIndex
CREATE INDEX "shop_product_variants_productId_idx" ON "shop_product_variants"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_variants_productId_combinationHash_key" ON "shop_product_variants"("productId", "combinationHash");

-- CreateIndex
CREATE INDEX "shop_variant_options_variantId_attributeId_idx" ON "shop_variant_options"("variantId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_variant_attributes_productId_attributeId_key" ON "shop_product_variant_attributes"("productId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_option_value_images_productId_optionValueId_key" ON "shop_product_option_value_images"("productId", "optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_inventory_items_variantId_key" ON "shop_inventory_items"("variantId");

-- CreateIndex
CREATE INDEX "_ProductCategoryMap_B_index" ON "_ProductCategoryMap"("B");

-- CreateIndex
CREATE INDEX "_ProductTagMap_B_index" ON "_ProductTagMap"("B");

-- AddForeignKey
ALTER TABLE "shop_product_categories" ADD CONSTRAINT "shop_product_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "shop_product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_variant_attributes" ADD CONSTRAINT "shop_variant_attributes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop_product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_variation_option_values" ADD CONSTRAINT "shop_variation_option_values_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "shop_variant_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "shop_product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_variants" ADD CONSTRAINT "shop_product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_variant_options" ADD CONSTRAINT "shop_variant_options_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "shop_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_variant_options" ADD CONSTRAINT "shop_variant_options_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "shop_variant_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_variant_options" ADD CONSTRAINT "shop_variant_options_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "shop_variation_option_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_variant_attributes" ADD CONSTRAINT "shop_product_variant_attributes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_variant_attributes" ADD CONSTRAINT "shop_product_variant_attributes_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "shop_variant_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_variant_attributes" ADD CONSTRAINT "shop_product_variant_attributes_defaultOptionValueId_fkey" FOREIGN KEY ("defaultOptionValueId") REFERENCES "shop_variation_option_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_option_value_images" ADD CONSTRAINT "shop_product_option_value_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_option_value_images" ADD CONSTRAINT "shop_product_option_value_images_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "shop_variation_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_inventory_items" ADD CONSTRAINT "shop_inventory_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "shop_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductCategoryMap" ADD CONSTRAINT "_ProductCategoryMap_A_fkey" FOREIGN KEY ("A") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductCategoryMap" ADD CONSTRAINT "_ProductCategoryMap_B_fkey" FOREIGN KEY ("B") REFERENCES "shop_product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductTagMap" ADD CONSTRAINT "_ProductTagMap_A_fkey" FOREIGN KEY ("A") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductTagMap" ADD CONSTRAINT "_ProductTagMap_B_fkey" FOREIGN KEY ("B") REFERENCES "shop_product_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
