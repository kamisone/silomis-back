-- Backfill the capability flags on faces that were seeded before they existed.
--
-- The seed only ever inserts fonts it has not inserted before, so an install
-- that already had these eight kept the column defaults — every face reading
-- "cannot be puffed", which would have hidden 3D puff from the editor entirely
-- on exactly the installs that have been running longest.
--
-- Block and slab faces have the wide flat columns foam needs. Scripts do not:
-- a fine stroke collapses over it. A joined script also cannot be bent along an
-- arc without breaking its joins, which is what supportsCurve says.
UPDATE "shop_embroidery_fonts" SET "supportsPuff" = true
WHERE "key" IN ('block-classic', 'block-bold', 'serif-varsity', 'sans-modern', 'mono-stencil');

UPDATE "shop_embroidery_fonts" SET "supportsCurve" = false
WHERE "key" IN ('script-signature');
