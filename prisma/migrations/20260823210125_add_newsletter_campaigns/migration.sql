-- CreateEnum
CREATE TYPE "NewsletterCampaignStatus" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled');

-- CreateEnum
CREATE TYPE "NewsletterCampaignType" AS ENUM ('newsletter', 'promotion', 'new_arrivals', 'flash_sale', 'category', 'abandoned_cart', 'product_launch', 'announcement');

-- CreateEnum
CREATE TYPE "NewsletterRecipientStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- AlterEnum
ALTER TYPE "NewsletterSubscriberStatus" ADD VALUE 'bounced';

-- AlterTable
ALTER TABLE "newsletter_subscribers" ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(250) NOT NULL,
    "previewText" VARCHAR(250),
    "htmlContent" TEXT NOT NULL DEFAULT '',
    "audience" JSONB NOT NULL DEFAULT '{"segment": "all"}',
    "status" "NewsletterCampaignStatus" NOT NULL DEFAULT 'draft',
    "type" "NewsletterCampaignType" NOT NULL DEFAULT 'newsletter',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "bullJobId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "subscriberId" TEXT,
    "email" VARCHAR(300) NOT NULL,
    "status" "NewsletterRecipientStatus" NOT NULL DEFAULT 'pending',
    "trackingToken" VARCHAR(64) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_campaign_recipients_trackingToken_key" ON "newsletter_campaign_recipients"("trackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_campaign_recipients_campaignId_email_key" ON "newsletter_campaign_recipients"("campaignId", "email");

-- AddForeignKey
ALTER TABLE "newsletter_campaign_recipients" ADD CONSTRAINT "newsletter_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "newsletter_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_campaign_recipients" ADD CONSTRAINT "newsletter_campaign_recipients_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "newsletter_subscribers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
