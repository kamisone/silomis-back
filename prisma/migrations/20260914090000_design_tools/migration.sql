-- Design tools: curved text, multiple lines, tracking and kerning, an outline
-- pass, 3D puff, a motif catalogue and thread finishes.
--
-- Entirely additive. Every new column has a default that reproduces today's
-- behaviour, so designs already in a basket or on the production floor read
-- back exactly as they were made.

-- AlterEnum
ALTER TYPE "PersonalizationContentType" ADD VALUE 'motif';

-- AlterTable
ALTER TABLE "shop_cart_item_personalizations" ADD COLUMN     "curveDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "hasOutline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPuff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kerning" JSONB,
ADD COLUMN     "lineCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "motifKey" VARCHAR(80),
ADD COLUMN     "motifName" VARCHAR(200),
ADD COLUMN     "motifPath" TEXT,
ADD COLUMN     "motifSizeMm" DOUBLE PRECISION,
ADD COLUMN     "motifViewBox" VARCHAR(80),
ADD COLUMN     "outlineThread" JSONB,
ADD COLUMN     "trackingPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "text" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "shop_embroidery_fonts" ADD COLUMN     "supportsCurve" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "supportsPuff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "shop_order_item_personalizations" ADD COLUMN     "curveDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "hasOutline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPuff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kerning" JSONB,
ADD COLUMN     "lineCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "motifKey" VARCHAR(80),
ADD COLUMN     "motifName" VARCHAR(200),
ADD COLUMN     "motifPath" TEXT,
ADD COLUMN     "motifSizeMm" DOUBLE PRECISION,
ADD COLUMN     "motifViewBox" VARCHAR(80),
ADD COLUMN     "outlineThread" JSONB,
ADD COLUMN     "trackingPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "text" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "shop_personalization_placements" ADD COLUMN     "allowPuff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "shop_thread_colors" ADD COLUMN     "finish" VARCHAR(20) NOT NULL DEFAULT 'matte',
ADD COLUMN     "priceMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "shop_embroidery_motifs" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" JSONB NOT NULL,
    "path" TEXT NOT NULL,
    "viewBox" VARCHAR(80) NOT NULL DEFAULT '0 0 100 100',
    "stitchesAt30mm" INTEGER NOT NULL DEFAULT 2200,
    "colorCount" INTEGER NOT NULL DEFAULT 1,
    "category" VARCHAR(80),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_embroidery_motifs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_embroidery_motifs_key_key" ON "shop_embroidery_motifs"("key");

-- CreateIndex
CREATE INDEX "shop_embroidery_motifs_isActive_sortOrder_idx" ON "shop_embroidery_motifs"("isActive", "sortOrder");

