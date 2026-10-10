-- A position's photograph per variation option (the front panel of the black cap).
CREATE TABLE "shop_personalization_placement_option_images" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,
    "mediaKey" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shop_personalization_placement_option_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shop_personalization_placement_option_images_placementId_op_key" ON "shop_personalization_placement_option_images"("placementId", "optionValueId");
CREATE INDEX "shop_personalization_placement_option_images_optionValueId_idx" ON "shop_personalization_placement_option_images"("optionValueId");

ALTER TABLE "shop_personalization_placement_option_images" ADD CONSTRAINT "shop_personalization_placement_option_images_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "shop_personalization_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_personalization_placement_option_images" ADD CONSTRAINT "shop_personalization_placement_option_images_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "shop_variation_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;
