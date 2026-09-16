-- The customer's own logo on a send-in: a fourth kind of box, and the
-- uploaded files behind it.
ALTER TYPE "PersonalizationContentType" ADD VALUE 'artwork';

CREATE TABLE "shop_send_in_artworks" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(300) NOT NULL,
    "originalKey" VARCHAR(300) NOT NULL,
    "originalName" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_send_in_artworks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shop_send_in_artworks_key_key" ON "shop_send_in_artworks"("key");
