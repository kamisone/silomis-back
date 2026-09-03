-- CreateTable
CREATE TABLE "shop_category_filters" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_category_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_category_filter_values" (
    "id" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shop_category_filter_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_filter_values" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_filter_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_category_filters_categoryId_idx" ON "shop_category_filters"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_category_filters_categoryId_slug_key" ON "shop_category_filters"("categoryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "shop_category_filter_values_filterId_value_key" ON "shop_category_filter_values"("filterId", "value");

-- CreateIndex
CREATE INDEX "shop_product_filter_values_filterId_idx" ON "shop_product_filter_values"("filterId");

-- CreateIndex
CREATE INDEX "shop_product_filter_values_valueId_idx" ON "shop_product_filter_values"("valueId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_filter_values_productId_filterId_key" ON "shop_product_filter_values"("productId", "filterId");

-- AddForeignKey
ALTER TABLE "shop_category_filters" ADD CONSTRAINT "shop_category_filters_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop_product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_category_filter_values" ADD CONSTRAINT "shop_category_filter_values_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "shop_category_filters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_filter_values" ADD CONSTRAINT "shop_product_filter_values_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_filter_values" ADD CONSTRAINT "shop_product_filter_values_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "shop_category_filters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_filter_values" ADD CONSTRAINT "shop_product_filter_values_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "shop_category_filter_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;
