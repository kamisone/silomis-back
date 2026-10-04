-- Per-product switch for the "Wrong size? No problem" block on the product
-- page. Off for every product, existing ones included: the block used to show
-- everywhere, and it is now something the admin turns on where it is true.
ALTER TABLE "shop_products" ADD COLUMN "showReturnsGuarantee" BOOLEAN NOT NULL DEFAULT false;
