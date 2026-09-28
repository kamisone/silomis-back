-- One panel scale for every catalogue position.
--
-- `fieldWidthMm`/`fieldHeightMm` were a measurement the admin typed per
-- position. They are not asked for any more (the tracing carries the meaning:
-- "the area about 100mm across"), so the rows kept whatever was last entered —
-- one position saying 100×50 and its neighbour 50×80. Since the on-screen scale
-- is `tracedWidthPx / fieldWidthMm`, the same 17mm of lettering was drawn at
-- 17% of one traced box and 34% of the other: the same design looked twice the
-- size depending on which panel the customer was looking at.
--
-- Send-in positions are left alone. There the panel really is the customer's
-- own item, measured off the photo they sent, and it still bounds how large a
-- design that item can take.
--
-- Designs already sold are untouched: every personalization row froze its own
-- copy of the hoop field at checkout, so no job on the floor changes size.
UPDATE "shop_personalization_placements"
SET "fieldWidthMm" = 100, "fieldHeightMm" = 50
WHERE "usesCustomerPhoto" = false
  AND ("fieldWidthMm" <> 100 OR "fieldHeightMm" <> 50);
