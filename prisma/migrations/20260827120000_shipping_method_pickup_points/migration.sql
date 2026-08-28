-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "pickupPointSnapshot" JSONB;

-- AlterTable
ALTER TABLE "shop_shipping_methods" ADD COLUMN     "code" VARCHAR(60),
ADD COLUMN     "requiresPickupPoint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresProductOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supportedCountryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "_ProductShippingMethods" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductShippingMethods_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProductShippingMethods_B_index" ON "_ProductShippingMethods"("B");

-- CreateIndex
CREATE UNIQUE INDEX "shop_shipping_methods_code_key" ON "shop_shipping_methods"("code");

-- AddForeignKey
ALTER TABLE "_ProductShippingMethods" ADD CONSTRAINT "_ProductShippingMethods_A_fkey" FOREIGN KEY ("A") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductShippingMethods" ADD CONSTRAINT "_ProductShippingMethods_B_fkey" FOREIGN KEY ("B") REFERENCES "shop_shipping_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

