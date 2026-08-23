-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('requested', 'approved', 'rejected', 'refunded', 'restocked');

-- CreateEnum
CREATE TYPE "PriceRuleType" AS ENUM ('percentage_off', 'fixed_off');

-- CreateEnum
CREATE TYPE "PriceRuleScope" AS ENUM ('variant', 'product', 'global');

-- CreateTable
CREATE TABLE "shop_return_requests" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerEmail" VARCHAR(300) NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'requested',
    "reason" TEXT,
    "adminNote" TEXT,
    "restockOnComplete" BOOLEAN NOT NULL DEFAULT true,
    "refundedAmountCents" INTEGER,
    "paymentTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_return_request_items" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shop_return_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_price_rules" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "type" "PriceRuleType" NOT NULL,
    "value" INTEGER NOT NULL,
    "scope" "PriceRuleScope" NOT NULL DEFAULT 'product',
    "variantId" TEXT,
    "productId" TEXT,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_tax_rates" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2),
    "categoryId" TEXT,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "label" VARCHAR(100) NOT NULL DEFAULT 'VAT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_return_requests_orderId_idx" ON "shop_return_requests"("orderId");

-- CreateIndex
CREATE INDEX "shop_return_requests_status_idx" ON "shop_return_requests"("status");

-- CreateIndex
CREATE INDEX "shop_price_rules_isActive_scope_idx" ON "shop_price_rules"("isActive", "scope");

-- CreateIndex
CREATE INDEX "shop_price_rules_productId_idx" ON "shop_price_rules"("productId");

-- CreateIndex
CREATE INDEX "shop_price_rules_variantId_idx" ON "shop_price_rules"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_tax_rates_countryCode_categoryId_key" ON "shop_tax_rates"("countryCode", "categoryId");

-- AddForeignKey
ALTER TABLE "shop_return_requests" ADD CONSTRAINT "shop_return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_return_request_items" ADD CONSTRAINT "shop_return_request_items_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "shop_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_return_request_items" ADD CONSTRAINT "shop_return_request_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "shop_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_price_rules" ADD CONSTRAINT "shop_price_rules_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "shop_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_price_rules" ADD CONSTRAINT "shop_price_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_tax_rates" ADD CONSTRAINT "shop_tax_rates_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop_product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
