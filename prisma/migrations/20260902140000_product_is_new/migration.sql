-- Draws the "New" badge on the storefront. Defaults to false so no existing
-- product suddenly starts advertising itself as new on deploy.
ALTER TABLE "shop_products" ADD COLUMN "isNew" BOOLEAN NOT NULL DEFAULT false;
