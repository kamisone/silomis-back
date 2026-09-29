-- A face no longer carries a letter-height range.
--
-- `minHeightMm`/`maxHeightMm` refused lettering outside 8-40mm per face. That is
-- a second, arbitrary answer to a question the geometry already answers, and the
-- same mistake `maxChars` made: what decides whether a size can be sewn is
-- whether the hoop fitted round the design fits the machine, which is measured
-- (TOO_WIDE / TOO_TALL) rather than guessed at per typeface. The customer picks
-- the size; the measurement decides.
--
-- The DTO still rails height at 1-2000mm, far outside anything stitchable, so a
-- crafted request cannot hand the renderer a nonsense number.
--
-- Guarded, so a partial or repeated run is harmless.
ALTER TABLE "shop_embroidery_fonts" DROP COLUMN IF EXISTS "minHeightMm";
ALTER TABLE "shop_embroidery_fonts" DROP COLUMN IF EXISTS "maxHeightMm";
