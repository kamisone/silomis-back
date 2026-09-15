-- Embroidery on the customer's own item: a service product hidden from the
-- catalogue, a position whose photo the customer supplies, and the job that
-- tracks the item's round trip with the shop's photographs along the way.

ALTER TABLE "shop_products" ADD COLUMN "isService" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shop_personalization_placements" ADD COLUMN "usesCustomerPhoto" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "shop_send_in_jobs" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "itemType" VARCHAR(40) NOT NULL,
  "note" TEXT,
  "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "panelCorners" JSONB NOT NULL,
  "panelWidthMm" DOUBLE PRECISION NOT NULL,
  "panelHeightMm" DOUBLE PRECISION NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'awaiting_item',
  "returnCarrier" VARCHAR(120),
  "returnTrackingNumber" VARCHAR(120),
  "returnTrackingUrl" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shop_send_in_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shop_send_in_jobs_orderId_key" ON "shop_send_in_jobs"("orderId");
CREATE UNIQUE INDEX "shop_send_in_jobs_orderItemId_key" ON "shop_send_in_jobs"("orderItemId");
CREATE INDEX "shop_send_in_jobs_status_idx" ON "shop_send_in_jobs"("status");
ALTER TABLE "shop_send_in_jobs" ADD CONSTRAINT "shop_send_in_jobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_send_in_jobs" ADD CONSTRAINT "shop_send_in_jobs_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "shop_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "shop_send_in_events" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "note" TEXT,
  "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_send_in_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shop_send_in_events_jobId_createdAt_idx" ON "shop_send_in_events"("jobId", "createdAt");
ALTER TABLE "shop_send_in_events" ADD CONSTRAINT "shop_send_in_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "shop_send_in_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
