-- AlterTable
ALTER TABLE "shop_promotions" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "shop_campaigns" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "bannerImageKey" VARCHAR(1000),
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_collections" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "imageKey" VARCHAR(1000),
    "seoTitle" VARCHAR(500),
    "seoDescription" TEXT,
    "metaKeywords" VARCHAR(500),
    "heroTitle" VARCHAR(255),
    "heroSubtitle" TEXT,
    "bodyHtml" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_collection_products" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_collection_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_collections_slug_key" ON "shop_collections"("slug");

-- CreateIndex
CREATE INDEX "shop_collections_isActive_isFeatured_idx" ON "shop_collections"("isActive", "isFeatured");

-- CreateIndex
CREATE UNIQUE INDEX "shop_collection_products_collectionId_productId_key" ON "shop_collection_products"("collectionId", "productId");

-- CreateIndex
CREATE INDEX "shop_promotions_campaignId_idx" ON "shop_promotions"("campaignId");

-- AddForeignKey
ALTER TABLE "shop_promotions" ADD CONSTRAINT "shop_promotions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "shop_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_collection_products" ADD CONSTRAINT "shop_collection_products_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "shop_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_collection_products" ADD CONSTRAINT "shop_collection_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
