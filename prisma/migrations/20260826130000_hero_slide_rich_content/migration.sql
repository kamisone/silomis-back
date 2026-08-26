-- The hero card's copy becomes one rich-text block instead of a title/subtitle
-- pair. Both the English columns and the six translation rows are folded into
-- it, so no authored copy is lost.

ALTER TABLE "shop_home_hero_slides" ADD COLUMN "content" TEXT;

UPDATE "shop_home_hero_slides"
SET "content" =
  '<h2>' || "title" || '</h2>' ||
  COALESCE('<p>' || NULLIF(btrim("subtitle"), '') || '</p>', '');

-- Same fold for the overlay languages: one 'content' row per (slide, lang),
-- built from that language's title and — when it has one — its subtitle.
INSERT INTO "translations" ("id", "entityType", "entityId", "field", "lang", "value", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'shop_home_hero_slide',
  t."entityId",
  'content',
  t."lang",
  '<h2>' || t."value" || '</h2>' || COALESCE('<p>' || NULLIF(btrim(s."value"), '') || '</p>', ''),
  now(),
  now()
FROM "translations" t
LEFT JOIN "translations" s
  ON s."entityType" = 'shop_home_hero_slide'
 AND s."entityId"   = t."entityId"
 AND s."lang"       = t."lang"
 AND s."field"      = 'subtitle'
WHERE t."entityType" = 'shop_home_hero_slide'
  AND t."field" = 'title'
ON CONFLICT ("entityType", "entityId", "field", "lang") DO NOTHING;

DELETE FROM "translations"
WHERE "entityType" = 'shop_home_hero_slide'
  AND "field" IN ('title', 'subtitle');

ALTER TABLE "shop_home_hero_slides" DROP COLUMN "title";
ALTER TABLE "shop_home_hero_slides" DROP COLUMN "subtitle";
