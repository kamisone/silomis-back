-- A design is stitched as its file draws it.
--
-- `ownColours` was an admin switch: a design with fills could be sewn in them,
-- or flattened into one spool the customer picks a colour for. The shop has
-- decided there is no such choice — the customer sizes and places a design, and
-- does not recolour it — so the switch is gone and the column now follows the
-- artwork: shapes with fills are sewn in those fills.
--
-- Re-asserts that for any design an admin had flattened, and recomputes its
-- colour count from the fills it actually carries, so the production sheet asks
-- the operator for the right number of cones. Idempotent.
--
-- The older seeded silhouettes are untouched: their `paths` is NULL — a single
-- outline and no fills at all — so there is nothing to sew them in, and they
-- keep taking a thread the customer picks.
UPDATE "shop_embroidery_motifs"
SET "ownColours" = true,
    "colorCount" = GREATEST((SELECT count(DISTINCT sh ->> 'fill') FROM jsonb_array_elements("paths") sh), 1)::int
WHERE "ownColours" = false
  AND jsonb_typeof("paths") = 'array'
  AND jsonb_array_length("paths") > 0;
