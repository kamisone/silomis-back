-- CreateTable
CREATE TABLE "blog_product_references" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" VARCHAR(300),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_product_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_product_references_postId_idx" ON "blog_product_references"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "blog_product_references_postId_productId_key" ON "blog_product_references"("postId", "productId");

-- AddForeignKey
ALTER TABLE "blog_product_references" ADD CONSTRAINT "blog_product_references_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_product_references" ADD CONSTRAINT "blog_product_references_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
