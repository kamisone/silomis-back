-- The preview's scale is the side position's own field now, not a size per
-- item type: the admin sets one field on the position, the way every other
-- position works.
ALTER TABLE "shop_send_in_item_types" DROP COLUMN "panelWidthMm";
ALTER TABLE "shop_send_in_item_types" DROP COLUMN "panelHeightMm";
