-- AlterTable
ALTER TABLE "shop_products" ADD COLUMN     "fastDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trackedDelivery" BOOLEAN NOT NULL DEFAULT false;
