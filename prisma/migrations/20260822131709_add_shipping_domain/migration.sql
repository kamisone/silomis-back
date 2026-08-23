-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('pending', 'label_created', 'in_transit', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "shop_shipping_zones" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "countryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "surchargeCents" INTEGER NOT NULL DEFAULT 0,
    "freeShippingThresholdCents" INTEGER,
    "estimatedDeliveryDays" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_shipping_methods" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "carrier" VARCHAR(200),
    "priceCents" INTEGER NOT NULL,
    "freeAboveCents" INTEGER,
    "estimatedDaysMin" INTEGER NOT NULL DEFAULT 2,
    "estimatedDaysMax" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "availableForFreeShipping" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_shipments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "methodId" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'pending',
    "carrier" VARCHAR(200),
    "trackingNumber" VARCHAR(300),
    "trackingUrl" VARCHAR(2000),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProductFreeShippingMethods" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductFreeShippingMethods_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "shop_shipping_methods_zoneId_idx" ON "shop_shipping_methods"("zoneId");

-- CreateIndex
CREATE INDEX "shop_shipments_orderId_idx" ON "shop_shipments"("orderId");

-- CreateIndex
CREATE INDEX "_ProductFreeShippingMethods_B_index" ON "_ProductFreeShippingMethods"("B");

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "shop_shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_shipping_methods" ADD CONSTRAINT "shop_shipping_methods_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "shop_shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductFreeShippingMethods" ADD CONSTRAINT "_ProductFreeShippingMethods_A_fkey" FOREIGN KEY ("A") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductFreeShippingMethods" ADD CONSTRAINT "_ProductFreeShippingMethods_B_fkey" FOREIGN KEY ("B") REFERENCES "shop_shipping_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
