-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected', 'hidden');

-- CreateEnum
CREATE TYPE "PaymentMethodStatus" AS ENUM ('active', 'expired', 'detached');

-- CreateEnum
CREATE TYPE "BehaviorEventType" AS ENUM ('product_view', 'search', 'add_to_cart', 'update_cart_item', 'remove_from_cart', 'checkout_started', 'test_checkout_blocked');

-- CreateEnum
CREATE TYPE "ReplaySessionStatus" AS ENUM ('active', 'ended', 'error');

-- CreateEnum
CREATE TYPE "ReplayEventType" AS ENUM ('session_start', 'session_end', 'click', 'scroll', 'navigation');

-- AlterTable
ALTER TABLE "shop_collections" ADD COLUMN     "heroCopy" TEXT;

-- AlterTable
ALTER TABLE "shop_promotions" ADD COLUMN     "bannerText" TEXT,
ADD COLUMN     "marketingLabel" VARCHAR(300);

-- CreateTable
CREATE TABLE "commerce_notification_logs" (
    "id" TEXT NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "recipient" VARCHAR(300) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "orderId" TEXT,
    "orderNumber" VARCHAR(50),
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_reviews" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "userId" TEXT,
    "authorName" VARCHAR(300) NOT NULL,
    "authorEmail" VARCHAR(300) NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(500),
    "body" TEXT,
    "media" JSONB NOT NULL DEFAULT '[]',
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "helpfulVotes" INTEGER NOT NULL DEFAULT 0,
    "rejectionReason" VARCHAR(500),
    "moderatedAt" TIMESTAMP(3),
    "moderatedBy" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_wishlist_items" (
    "id" TEXT NOT NULL,
    "sessionToken" VARCHAR(100),
    "userId" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_user_payment_methods" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentTypeId" TEXT,
    "providerMethodId" VARCHAR(300) NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'stripe',
    "cardBrand" VARCHAR(50),
    "cardLast4" CHAR(4),
    "cardExpMonth" INTEGER,
    "cardExpYear" INTEGER,
    "billingAddressId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaymentMethodStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_user_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_behavior_events" (
    "id" TEXT NOT NULL,
    "eventType" "BehaviorEventType" NOT NULL,
    "cartToken" VARCHAR(100),
    "shopCustomerId" TEXT,
    "productId" TEXT,
    "quantity" INTEGER,
    "searchQuery" TEXT,
    "resultCount" INTEGER,
    "visitorHash" VARCHAR(64),
    "countryCode" CHAR(2),
    "clientIp" VARCHAR(64),
    "device" VARCHAR(20),
    "source" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_behavior_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_replay_sessions" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "cartToken" TEXT,
    "visitorHash" VARCHAR(64),
    "clientIp" VARCHAR(64),
    "countryCode" CHAR(2),
    "device" VARCHAR(20),
    "source" VARCHAR(100),
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "pageUrl" VARCHAR(2000),
    "pageTitle" VARCHAR(500),
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "maxScrollPct" INTEGER NOT NULL DEFAULT 0,
    "status" "ReplaySessionStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "viewedAt" TIMESTAMP(3),

    CONSTRAINT "shop_replay_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_replay_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "ReplayEventType" NOT NULL,
    "timestampMs" INTEGER NOT NULL,
    "label" TEXT,
    "meta" JSONB,

    CONSTRAINT "shop_replay_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_replay_session_chunks" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "gcsObjectKey" VARCHAR(500) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_replay_session_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commerce_notification_logs_event_createdAt_idx" ON "commerce_notification_logs"("event", "createdAt");

-- CreateIndex
CREATE INDEX "shop_product_reviews_productId_status_idx" ON "shop_product_reviews"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_reviews_orderId_productId_key" ON "shop_product_reviews"("orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_wishlist_items_sessionToken_productId_key" ON "shop_wishlist_items"("sessionToken", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_wishlist_items_userId_productId_key" ON "shop_wishlist_items"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_user_payment_methods_providerMethodId_key" ON "shop_user_payment_methods"("providerMethodId");

-- CreateIndex
CREATE INDEX "shop_user_payment_methods_customerId_idx" ON "shop_user_payment_methods"("customerId");

-- CreateIndex
CREATE INDEX "shop_behavior_events_eventType_createdAt_idx" ON "shop_behavior_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "shop_behavior_events_productId_idx" ON "shop_behavior_events"("productId");

-- CreateIndex
CREATE INDEX "shop_replay_sessions_status_idx" ON "shop_replay_sessions"("status");

-- CreateIndex
CREATE INDEX "shop_replay_sessions_productId_idx" ON "shop_replay_sessions"("productId");

-- CreateIndex
CREATE INDEX "shop_replay_events_sessionId_idx" ON "shop_replay_events"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_replay_session_chunks_sessionId_sequence_key" ON "shop_replay_session_chunks"("sessionId", "sequence");

-- AddForeignKey
ALTER TABLE "shop_product_reviews" ADD CONSTRAINT "shop_product_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_reviews" ADD CONSTRAINT "shop_product_reviews_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "shop_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_wishlist_items" ADD CONSTRAINT "shop_wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_user_payment_methods" ADD CONSTRAINT "shop_user_payment_methods_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "shop_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_user_payment_methods" ADD CONSTRAINT "shop_user_payment_methods_paymentTypeId_fkey" FOREIGN KEY ("paymentTypeId") REFERENCES "shop_payment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_user_payment_methods" ADD CONSTRAINT "shop_user_payment_methods_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "shop_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_replay_events" ADD CONSTRAINT "shop_replay_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "shop_replay_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_replay_session_chunks" ADD CONSTRAINT "shop_replay_session_chunks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "shop_replay_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
