-- Design library tabs become admin data.
--
-- The motif's `category` was a free string whose label lived in the storefront's
-- compiled translation maps, so a shop could neither add a tab nor rename one.
-- It becomes a row with a localized name, and the motif points at it.
--
-- Hand-written: a generated diff would DROP "category" and ADD "categoryId"
-- in either order, which loses every grouping the seed and the shop have set.
-- The order below is: table, rows for the categories in use, backfill, drop.

CREATE TABLE "shop_embroidery_motif_categories" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_embroidery_motif_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shop_embroidery_motif_categories_key_key" ON "shop_embroidery_motif_categories"("key");
CREATE INDEX "shop_embroidery_motif_categories_isActive_sortOrder_idx" ON "shop_embroidery_motif_categories"("isActive", "sortOrder");

-- One row per category actually in use, named in all seven languages — these
-- are the exact labels the storefront shipped hard-coded, so nothing a customer
-- sees changes on the way through this migration. A category the shop invented
-- by hand gets its key title-cased as an English name, which the admin can then
-- translate in the designs page.
INSERT INTO "shop_embroidery_motif_categories" ("id", "key", "name", "sortOrder", "updatedAt")
SELECT
    gen_random_uuid(),
    c."category",
    COALESCE(
        (
            '{"love":{"en":"Love","fr":"Amour","es":"Amor","it":"Amore","de":"Liebe","nl":"Liefde","pl":"Miłość"},
              "shapes":{"en":"Shapes","fr":"Formes","es":"Formas","it":"Forme","de":"Formen","nl":"Vormen","pl":"Kształty"},
              "animals":{"en":"Animals","fr":"Animaux","es":"Animales","it":"Animali","de":"Tiere","nl":"Dieren","pl":"Zwierzęta"},
              "outdoors":{"en":"Outdoors","fr":"Plein air","es":"Aire libre","it":"All’aperto","de":"Draußen","nl":"Buiten","pl":"Na zewnątrz"},
              "nature":{"en":"Nature","fr":"Nature","es":"Naturaleza","it":"Natura","de":"Natur","nl":"Natuur","pl":"Natura"},
              "sport":{"en":"Sport","fr":"Sport","es":"Deporte","it":"Sport","de":"Sport","nl":"Sport","pl":"Sport"},
              "symbols":{"en":"Symbols","fr":"Symboles","es":"Símbolos","it":"Simboli","de":"Symbole","nl":"Symbolen","pl":"Symbole"},
              "social":{"en":"Social","fr":"Réseaux sociaux","es":"Redes sociales","it":"Social","de":"Social Media","nl":"Social media","pl":"Social media"},
              "modern":{"en":"Modern","fr":"Moderne","es":"Moderno","it":"Moderno","de":"Modern","nl":"Modern","pl":"Nowoczesne"},
              "food":{"en":"Food","fr":"Gourmand","es":"Comida","it":"Cibo","de":"Essen","nl":"Eten","pl":"Jedzenie"},
              "other":{"en":"Other","fr":"Autres","es":"Otros","it":"Altro","de":"Sonstiges","nl":"Overig","pl":"Inne"}}'::jsonb
        ) -> c."category",
        jsonb_build_object('en', initcap(replace(c."category", '-', ' ')))
    ),
    -- Tabs keep the order their designs were already in, renumbered by tens so
    -- the admin's move-up/move-down has room to swap without a reshuffle.
    (ROW_NUMBER() OVER (ORDER BY c."ord", c."category")) * 10,
    CURRENT_TIMESTAMP
FROM (
    SELECT "category", MIN("sortOrder") AS "ord"
    FROM "shop_embroidery_motifs"
    WHERE "category" IS NOT NULL AND btrim("category") <> ''
    GROUP BY "category"
) AS c;

ALTER TABLE "shop_embroidery_motifs" ADD COLUMN "categoryId" TEXT;

UPDATE "shop_embroidery_motifs" m
SET "categoryId" = c."id"
FROM "shop_embroidery_motif_categories" c
WHERE c."key" = m."category";

ALTER TABLE "shop_embroidery_motifs" DROP COLUMN "category";

CREATE INDEX "shop_embroidery_motifs_categoryId_idx" ON "shop_embroidery_motifs"("categoryId");

-- SET NULL, not CASCADE: deleting a tab must not delete the shop's artwork.
ALTER TABLE "shop_embroidery_motifs"
    ADD CONSTRAINT "shop_embroidery_motifs_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "shop_embroidery_motif_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
