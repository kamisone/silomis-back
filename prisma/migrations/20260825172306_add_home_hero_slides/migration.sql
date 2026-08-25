-- CreateTable
CREATE TABLE "shop_home_hero_slides" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageKey" VARCHAR(1000),
    "imageAlt" VARCHAR(300),
    "eyebrow" VARCHAR(120),
    "title" VARCHAR(255) NOT NULL,
    "subtitle" TEXT,
    "ctaLabel" VARCHAR(80),
    "ctaHref" VARCHAR(500),
    "ctaSecondaryLabel" VARCHAR(80),
    "ctaSecondaryHref" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_home_hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_home_hero_slides_isActive_sortOrder_idx" ON "shop_home_hero_slides"("isActive", "sortOrder");
