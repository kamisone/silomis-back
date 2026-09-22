-- Embroidery production collapses to two states: waiting and done.
--
-- `stitched` was the only one that meant finished; the other three were
-- stages of the same unfinished job, so they all fold into `waiting`.
-- Written as a CASE over every value rather than three UPDATEs so a row
-- carrying anything unexpected still lands somewhere valid.

UPDATE "shop_order_item_personalizations"
SET "productionStatus" = CASE
  WHEN "productionStatus" = 'stitched' THEN 'done'
  ELSE 'waiting'
END;

ALTER TABLE "shop_order_item_personalizations"
  ALTER COLUMN "productionStatus" SET DEFAULT 'waiting';
