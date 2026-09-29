-- Stitch counting is removed, and with it the price ladder built on top of it.
--
-- Machine time IS stitches, so the unit was the honest one — but only a
-- digitised file has a stitch count, and ours was a parametric guess: a
-- per-face character average, a height exponent the code itself documented as
-- "1.2-1.4 in practice", and a handful of uncalibrated multipliers for weight,
-- puff, curve and outline. Pricing off that guess put its whole error on the
-- invoice, and nothing ever compared it against a digitiser's real figure.
--
-- Embroidery is now priced from figures the shop states: the position's own
-- price, plus each design's surcharge, plus a fee for the second and further
-- boxes on a position.
--
-- MONEY MIGRATION. A catalogue design cost `band + position`. With the bands
-- gone it would cost `position` alone, so every design would silently get
-- cheaper by the band it used to fall in. Each position's price is raised by its
-- template's SMALLEST band instead: the cheapest a design could ever have been
-- is unchanged, and nothing becomes more expensive. Designs that used to fall in
-- a higher band do get cheaper — that is the arithmetic of a flat price, and the
-- shop should review its position prices in the studio afterwards.
--
-- Send-in positions are untouched: their price is the item type's flat side fee
-- and never included a band.
--
-- Every statement is guarded, because the first version of this file failed
-- partway on a wrong table name and left the column above already added. DDL
-- that cannot be re-run turns a typo into a hand-repaired database.
ALTER TABLE "shop_personalization_templates"
  ADD COLUMN IF NOT EXISTS "extraBoxCents" INTEGER NOT NULL DEFAULT 0;

-- Guarded on the ladder still existing, so re-running cannot raise prices twice.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_personalization_price_bands') THEN
    UPDATE "shop_personalization_placements" p
    SET "priceCents" = p."priceCents" + COALESCE(floor.cents, 0)
    FROM "shop_products" prod
    JOIN (
      SELECT "templateId", MIN("priceCents") AS cents
      FROM "shop_personalization_price_bands"
      GROUP BY "templateId"
    ) AS floor ON floor."templateId" = prod."personalizationTemplateId"
    WHERE prod.id = p."productId"
      AND p."usesCustomerPhoto" = false;
  END IF;
END $$;

DROP TABLE IF EXISTS "shop_personalization_price_bands";

ALTER TABLE "shop_embroidery_fonts"  DROP COLUMN IF EXISTS "stitchesPerCharAt10mm";
ALTER TABLE "shop_embroidery_motifs" DROP COLUMN IF EXISTS "stitchesAt30mm";

-- Frozen on every sold line, but a frozen guess is still a guess: nothing reads
-- it now that neither the price nor the operator's sheet mentions it.
ALTER TABLE "shop_cart_item_personalizations"  DROP COLUMN IF EXISTS "stitchEstimate";
ALTER TABLE "shop_order_item_personalizations" DROP COLUMN IF EXISTS "stitchEstimate";
