-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('order_placed', 'order_cancelled', 'order_paid', 'order_refunded', 'order_shipped', 'manual_adjustment', 'refund', 'restock');

-- CreateTable
CREATE TABLE "shop_inventory_movements" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "orderId" TEXT,
    "adminId" TEXT,
    "type" "InventoryMovementType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "availableAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "committedAfter" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_event_log" (
    "id" TEXT NOT NULL,
    "eventName" VARCHAR(200) NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "source" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_inventory_movements_variantId_idx" ON "shop_inventory_movements"("variantId");

-- CreateIndex
CREATE INDEX "shop_inventory_movements_orderId_idx" ON "shop_inventory_movements"("orderId");

-- CreateIndex
CREATE INDEX "commerce_event_log_eventName_createdAt_idx" ON "commerce_event_log"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "commerce_event_log_entityId_idx" ON "commerce_event_log"("entityId");
