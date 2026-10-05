-- Which embroidery editors a product offers: "Just add my text" and "Design
-- it myself". Both on for every product, existing ones included — the editor
-- offered both until now, so nothing changes until an admin narrows it.
ALTER TABLE "shop_products" ADD COLUMN "embroideryModeSimple" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "shop_products" ADD COLUMN "embroideryModeAdvanced" BOOLEAN NOT NULL DEFAULT true;
