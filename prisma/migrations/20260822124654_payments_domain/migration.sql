-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('charge', 'refund', 'partial_refund');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('pending', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "shop_payment_transactions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'stripe',
    "providerTransactionId" VARCHAR(500) NOT NULL,
    "webhookEventId" VARCHAR(500),
    "type" "PaymentTransactionType" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'EUR',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_payment_types" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "iconKey" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_payment_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_payment_transactions_webhookEventId_key" ON "shop_payment_transactions"("webhookEventId");

-- CreateIndex
CREATE INDEX "shop_payment_transactions_orderId_idx" ON "shop_payment_transactions"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_payment_types_code_key" ON "shop_payment_types"("code");

-- CreateIndex
CREATE INDEX "shop_orders_paymentIntentId_idx" ON "shop_orders"("paymentIntentId");
