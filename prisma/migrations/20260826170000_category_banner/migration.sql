-- Wide banner for the category listing page. Distinct from imageKey, which is
-- the small tile used on the home page — different crop, different job.
ALTER TABLE "shop_product_categories" ADD COLUMN "bannerKey" VARCHAR(1000);
