-- The four-corner tracing on a position is gone.
--
-- Eight corner columns and an `isTraced` flag described a quad the admin dragged
-- around the embroidery area on the position's photo. They never carried more
-- than a centre and a size: the quad was deliberately never skewed onto the
-- artwork — a design mapped through a trapezoid has no side parallel to the
-- image, so a quarter turn comes out leaning and "vertical" never looks
-- vertical — so every consumer averaged the opposite edges down to an upright
-- box before drawing anything. The `preview*` box says the same thing in four
-- numbers, and dragging four handles per position bought nothing over it.
--
-- `previewRotateDeg` goes with them: it only ever turned the non-interactive
-- fallback box, and a design is always drawn upright.
--
-- Nothing is migrated across. The corners and the box held the same default
-- rectangle, and where they differed it was the box the storefront had been
-- drawing in for every untraced position anyway.
--
-- A customer's framing on a send-in is NOT affected: those corners arrive with
-- the request and are frozen into the design document, never stored here.
ALTER TABLE "shop_personalization_placements"
  DROP COLUMN "topLeftXPct",
  DROP COLUMN "topLeftYPct",
  DROP COLUMN "topRightXPct",
  DROP COLUMN "topRightYPct",
  DROP COLUMN "bottomRightXPct",
  DROP COLUMN "bottomRightYPct",
  DROP COLUMN "bottomLeftXPct",
  DROP COLUMN "bottomLeftYPct",
  DROP COLUMN "isTraced",
  DROP COLUMN "previewRotateDeg";
