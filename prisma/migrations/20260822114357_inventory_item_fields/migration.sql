/*
  Warnings:

  - You are about to drop the column `createdAt` on the `shop_inventory_items` table. All the data in the column will be lost.
  - You are about to drop the column `quantityOnHand` on the `shop_inventory_items` table. All the data in the column will be lost.
  - You are about to drop the column `quantityReserved` on the `shop_inventory_items` table. All the data in the column will be lost.
  - You are about to drop the column `reorderThreshold` on the `shop_inventory_items` table. All the data in the column will be lost.
  - Added the required column `productId` to the `shop_inventory_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "shop_inventory_items" DROP COLUMN "createdAt",
DROP COLUMN "quantityOnHand",
DROP COLUMN "quantityReserved",
DROP COLUMN "reorderThreshold",
ADD COLUMN     "available" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "committed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "incoming" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "reserved" INTEGER NOT NULL DEFAULT 0;
