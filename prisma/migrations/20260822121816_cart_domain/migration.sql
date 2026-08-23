-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'completed', 'abandoned', 'merged');

-- CreateTable
CREATE TABLE "shop_carts" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "status" "CartStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_cart_items" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "titleSnapshot" VARCHAR(500) NOT NULL,
    "skuSnapshot" VARCHAR(200),
    "imageKeySnapshot" VARCHAR(1000),
    "optionsSnapshot" JSONB,
    "compareAtPriceCentsSnapshot" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_carts_token_key" ON "shop_carts"("token");

-- CreateIndex
CREATE UNIQUE INDEX "shop_cart_items_cartId_variantId_key" ON "shop_cart_items"("cartId", "variantId");

-- AddForeignKey
ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "shop_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
