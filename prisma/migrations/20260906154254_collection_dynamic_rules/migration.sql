-- Reconstructed. The original migration.sql for this entry was lost from the
-- repository while the migration itself stayed recorded as applied, which made
-- every later `prisma migrate` command fail with P3015. The statements below
-- were rebuilt from the live schema they produced, and the recorded checksum
-- was updated to match this file.

-- CreateEnum
CREATE TYPE "CollectionType" AS ENUM ('manual', 'dynamic');

-- CreateEnum
CREATE TYPE "CollectionRuleMatch" AS ENUM ('all', 'any');

-- AlterTable
ALTER TABLE "shop_collections" ADD COLUMN     "ruleMatch" "CollectionRuleMatch" NOT NULL DEFAULT 'all',
ADD COLUMN     "type" "CollectionType" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "shop_collection_rules" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "field" VARCHAR(50) NOT NULL,
    "operator" VARCHAR(50) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_collection_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_collection_rules_collectionId_idx" ON "shop_collection_rules"("collectionId");

-- AddForeignKey
ALTER TABLE "shop_collection_rules" ADD CONSTRAINT "shop_collection_rules_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "shop_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
