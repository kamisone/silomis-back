-- Abandoned-cart SMS consent, checkout phone verification, STOP replies.
ALTER TABLE "shop_orders" ADD COLUMN "smsMarketingOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shop_orders" ADD COLUMN "smsMarketingOptInAt" TIMESTAMP(3);
ALTER TABLE "shop_orders" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE TABLE "sms_opt_outs" (
    "phone" VARCHAR(50) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sms_opt_outs_pkey" PRIMARY KEY ("phone")
);
