-- CreateEnum
CREATE TYPE "HomeSectionType" AS ENUM ('hero', 'trust_bar', 'categories', 'featured_collections', 'product_rail', 'promo_banner', 'blog_posts');

-- CreateTable
CREATE TABLE "shop_home_sections" (
    "id" TEXT NOT NULL,
    "type" "HomeSectionType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_home_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_home_sections_isActive_sortOrder_idx" ON "shop_home_sections"("isActive", "sortOrder");
