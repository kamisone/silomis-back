-- Web fonts loaded by URL, so a face looks the same on every device.
ALTER TABLE "shop_embroidery_fonts" ADD COLUMN "webFontCss" VARCHAR(500);
