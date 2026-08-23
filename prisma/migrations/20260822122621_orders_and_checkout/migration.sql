-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending', 'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "CheckoutStep" AS ENUM ('address', 'shipping', 'payment', 'complete');

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "isTestOrder" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "customerId" TEXT,
    "customerEmail" VARCHAR(300) NOT NULL,
    "customerName" VARCHAR(300),
    "customerCompanyName" VARCHAR(300),
    "customerPhone" VARCHAR(50),
    "shippingAddressSnapshot" JSONB NOT NULL,
    "billingAddressSnapshot" JSONB,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "categoryDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "pricingSnapshot" JSONB,
    "platformFeeBps" INTEGER NOT NULL DEFAULT 1000,
    "couponCode" VARCHAR(100),
    "shippingMethodId" TEXT,
    "paymentMethodId" TEXT,
    "customerLocale" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "trackingToken" TEXT,
    "cartToken" VARCHAR(100),
    "paymentIntentId" VARCHAR(500),
    "reservationExpiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "clientIpAddress" VARCHAR(64),
    "clientUserAgent" TEXT,
    "metaClickId" VARCHAR(500),
    "metaBrowserId" VARCHAR(500),
    "tiktokClickId" VARCHAR(500),
    "tiktokBrowserId" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "vendorId" TEXT,
    "titleSnapshot" VARCHAR(500) NOT NULL,
    "skuSnapshot" VARCHAR(200),
    "imageKeySnapshot" VARCHAR(1000),
    "optionsSnapshot" JSONB,
    "compareAtPriceCentsSnapshot" INTEGER,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "taxRatePct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" VARCHAR(30),
    "toStatus" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_status_refs" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(50),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shop_order_status_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" TEXT NOT NULL,
    "cartToken" VARCHAR(36) NOT NULL,
    "orderId" TEXT,
    "step" "CheckoutStep" NOT NULL DEFAULT 'address',
    "formSnapshot" JSONB,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "resumeToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_orderNumber_key" ON "shop_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_trackingToken_key" ON "shop_orders"("trackingToken");

-- CreateIndex
CREATE INDEX "shop_orders_status_idx" ON "shop_orders"("status");

-- CreateIndex
CREATE INDEX "shop_orders_customerEmail_idx" ON "shop_orders"("customerEmail");

-- CreateIndex
CREATE INDEX "shop_orders_isTestOrder_idx" ON "shop_orders"("isTestOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shop_order_status_refs_code_key" ON "shop_order_status_refs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_cartToken_key" ON "checkout_sessions"("cartToken");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_resumeToken_key" ON "checkout_sessions"("resumeToken");

-- CreateIndex
CREATE INDEX "checkout_sessions_orderId_idx" ON "checkout_sessions"("orderId");

-- CreateIndex
CREATE INDEX "checkout_sessions_expiresAt_idx" ON "checkout_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_status_history" ADD CONSTRAINT "shop_order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
