-- Checkout asks for an email OR a phone: a phone-only order has no address.
ALTER TABLE "shop_orders" ALTER COLUMN "customerEmail" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "customerEmail" DROP NOT NULL;
ALTER TABLE "shop_return_requests" ALTER COLUMN "customerEmail" DROP NOT NULL;
ALTER TABLE "shop_customers" ALTER COLUMN "email" DROP NOT NULL;

-- A phone-only customer is found by phone.
CREATE INDEX "shop_customers_phone_idx" ON "shop_customers"("phone");
