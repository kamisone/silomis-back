-- AlterTable
ALTER TABLE "shop_cart_item_personalizations" ADD COLUMN     "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "shop_order_item_personalizations" ADD COLUMN     "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0;

