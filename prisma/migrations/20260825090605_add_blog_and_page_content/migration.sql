-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('draft', 'scheduled', 'published', 'archived');

-- CreateTable
CREATE TABLE "blog_categories" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(300) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "color" VARCHAR(7),
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_tags" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(300) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "status" "BlogPostStatus" NOT NULL DEFAULT 'draft',
    "title" VARCHAR(500) NOT NULL,
    "excerpt" TEXT,
    "content" TEXT,
    "featuredImageKey" VARCHAR(1000),
    "featuredImageAlt" VARCHAR(300),
    "seoTitle" VARCHAR(500),
    "seoDescription" VARCHAR(500),
    "canonicalUrl" VARCHAR(500),
    "readingTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "scheduledPublishAt" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "authorName" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_contents" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BlogPostCategoryMap" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BlogPostCategoryMap_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BlogPostTagMap" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BlogPostTagMap_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "blog_tags_slug_key" ON "blog_tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_idx" ON "blog_posts"("status");

-- CreateIndex
CREATE INDEX "blog_posts_featured_idx" ON "blog_posts"("featured");

-- CreateIndex
CREATE INDEX "blog_posts_publishedAt_idx" ON "blog_posts"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "page_contents_slug_locale_key" ON "page_contents"("slug", "locale");

-- CreateIndex
CREATE INDEX "_BlogPostCategoryMap_B_index" ON "_BlogPostCategoryMap"("B");

-- CreateIndex
CREATE INDEX "_BlogPostTagMap_B_index" ON "_BlogPostTagMap"("B");

-- AddForeignKey
ALTER TABLE "_BlogPostCategoryMap" ADD CONSTRAINT "_BlogPostCategoryMap_A_fkey" FOREIGN KEY ("A") REFERENCES "blog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BlogPostCategoryMap" ADD CONSTRAINT "_BlogPostCategoryMap_B_fkey" FOREIGN KEY ("B") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BlogPostTagMap" ADD CONSTRAINT "_BlogPostTagMap_A_fkey" FOREIGN KEY ("A") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BlogPostTagMap" ADD CONSTRAINT "_BlogPostTagMap_B_fkey" FOREIGN KEY ("B") REFERENCES "blog_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
