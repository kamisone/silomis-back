/*
  Warnings:

  - You are about to drop the column `canonicalUrl` on the `shop_products` table. All the data in the column will be lost.
  - You are about to drop the column `seoDescription` on the `shop_products` table. All the data in the column will be lost.
  - You are about to drop the column `seoTitle` on the `shop_products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "shop_products" DROP COLUMN "canonicalUrl",
DROP COLUMN "seoDescription",
DROP COLUMN "seoTitle";
