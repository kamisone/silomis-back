-- AlterTable
ALTER TABLE "shop_cart_item_personalizations" ADD COLUMN     "fontWeight" INTEGER NOT NULL DEFAULT 400;

-- AlterTable
ALTER TABLE "shop_order_item_personalizations" ADD COLUMN     "fontWeight" INTEGER NOT NULL DEFAULT 400;

-- AlterTable
ALTER TABLE "shop_personalization_placements" ALTER COLUMN "updatedAt" DROP DEFAULT;

