-- A picture of each design on its photo, for the basket and the checkout.
ALTER TABLE "shop_cart_item_personalizations" ADD COLUMN "previewKey" VARCHAR(300);
ALTER TABLE "shop_order_item_personalizations" ADD COLUMN "previewKey" VARCHAR(300);
