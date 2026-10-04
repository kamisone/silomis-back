-- Optional checkout address fields (company name, phone, address line 2),
-- now asked only when a product in the basket switches them on. Off for every
-- product, existing ones included: the fields used to show on every checkout,
-- and the admin now turns them on where they are needed.
ALTER TABLE "shop_products" ADD COLUMN "askCompanyName" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shop_products" ADD COLUMN "askPhone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shop_products" ADD COLUMN "askAddressLine2" BOOLEAN NOT NULL DEFAULT false;
