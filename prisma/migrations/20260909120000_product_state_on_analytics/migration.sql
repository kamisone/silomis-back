-- Snapshot the product's test/live state onto every analytics row.
--
-- The demand report is split into a "Tests" and a "Live" tab, and a product
-- moves between them with one toggle. Deriving the tab from the live
-- Product.isTestProduct flag would make that toggle rewrite history — every
-- past event of a promoted product would jump to the other tab. Recording the
-- state at write time keeps each event in the phase it actually happened in.

ALTER TABLE "shop_behavior_events" ADD COLUMN "productIsTest" BOOLEAN;
ALTER TABLE "shop_replay_sessions" ADD COLUMN "productIsTest" BOOLEAN;

-- Backfill from the current flag. It is the only signal available for rows
-- written before this column existed: not exact for a product that has already
-- been promoted, but it puts every historical row in a tab rather than in
-- neither, and everything from here on is recorded exactly.
UPDATE "shop_behavior_events" be
SET "productIsTest" = p."isTestProduct"
FROM "shop_products" p
WHERE p.id = be."productId" AND be."productIsTest" IS NULL;

UPDATE "shop_replay_sessions" rs
SET "productIsTest" = p."isTestProduct"
FROM "shop_products" p
WHERE p.id = rs."productId" AND rs."productIsTest" IS NULL;

-- Both reports filter on (productId, productIsTest) over a date window.
CREATE INDEX "shop_behavior_events_productId_productIsTest_idx"
  ON "shop_behavior_events" ("productId", "productIsTest");
CREATE INDEX "shop_replay_sessions_productId_productIsTest_idx"
  ON "shop_replay_sessions" ("productId", "productIsTest");
