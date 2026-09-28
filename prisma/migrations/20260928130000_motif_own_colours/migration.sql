-- Splits "has shapes" from "sewn in its own colours".
--
-- `paths` carried both meanings: a row with shapes was a full-colour design, and
-- a one-colour design had to be the single `path`. That forced a one-colour
-- upload whose file places its shapes with transforms to be flattened into one
-- `d`, which cannot be done — so all but the first shape were dropped.
--
-- Backfilled so nothing changes for an existing row: a design that has shapes
-- today is exactly a design that was sewn in its own colours.
ALTER TABLE "shop_embroidery_motifs" ADD COLUMN "ownColours" BOOLEAN NOT NULL DEFAULT false;

UPDATE "shop_embroidery_motifs"
SET "ownColours" = true
WHERE jsonb_typeof("paths") = 'array' AND jsonb_array_length("paths") > 0;
