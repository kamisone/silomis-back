-- A swatch photo per language. Every existing photo becomes the default ("")
-- shown in every language, so nothing changes on the storefront until an
-- admin adds a language photo.
ALTER TABLE "shop_product_option_value_images" ADD COLUMN "locale" VARCHAR(10) NOT NULL DEFAULT '';

-- One photo per (product, option, language) instead of per (product, option).
-- Created before the old index is dropped so the table is never without one.
CREATE UNIQUE INDEX "shop_product_option_value_images_productId_optionValueId_lo_key" ON "shop_product_option_value_images"("productId", "optionValueId", "locale");
DROP INDEX "shop_product_option_value_images_productId_optionValueId_key";
