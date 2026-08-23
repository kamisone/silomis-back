-- CreateTable
CREATE TABLE "shop_countries" (
    "isoCode" CHAR(2) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "phonePrefix" VARCHAR(10),
    "currencyCode" CHAR(3),
    "isoCode3" CHAR(3),
    "continentCode" VARCHAR(2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isShippingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isEuVat" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shop_countries_pkey" PRIMARY KEY ("isoCode")
);

-- CreateTable
CREATE TABLE "shop_addresses" (
    "id" TEXT NOT NULL,
    "fullName" VARCHAR(300),
    "company" VARCHAR(500),
    "unitNumber" VARCHAR(50),
    "streetNumber" VARCHAR(50),
    "line1" VARCHAR(500) NOT NULL,
    "line2" VARCHAR(500),
    "city" VARCHAR(200) NOT NULL,
    "state" VARCHAR(200),
    "postalCode" VARCHAR(20) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "phone" VARCHAR(50),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_customers" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(300) NOT NULL,
    "firstName" VARCHAR(300),
    "lastName" VARCHAR(300),
    "phone" VARCHAR(50),
    "userId" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT true,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpentCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressId" TEXT,
    "name" VARCHAR(300) NOT NULL,
    "line1" VARCHAR(500) NOT NULL,
    "line2" VARCHAR(500),
    "city" VARCHAR(200) NOT NULL,
    "zip" VARCHAR(20) NOT NULL,
    "country" VARCHAR(10) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_customer_groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "criteria" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_countries_isActive_idx" ON "shop_countries"("isActive");

-- CreateIndex
CREATE INDEX "shop_addresses_countryCode_idx" ON "shop_addresses"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "shop_customers_email_key" ON "shop_customers"("email");

-- CreateIndex
CREATE INDEX "shop_customer_addresses_customerId_idx" ON "shop_customer_addresses"("customerId");

-- CreateIndex
CREATE INDEX "shop_customer_addresses_addressId_idx" ON "shop_customer_addresses"("addressId");

-- AddForeignKey
ALTER TABLE "shop_addresses" ADD CONSTRAINT "shop_addresses_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "shop_countries"("isoCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_customer_addresses" ADD CONSTRAINT "shop_customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "shop_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_customer_addresses" ADD CONSTRAINT "shop_customer_addresses_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "shop_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
