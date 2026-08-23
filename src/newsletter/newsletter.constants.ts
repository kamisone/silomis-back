export const NEWSLETTER_CAMPAIGN_QUEUE = 'newsletter-campaign';
export const NEWSLETTER_SEND_CAMPAIGN_JOB = 'send-campaign';
export const NEWSLETTER_BATCH_SIZE = 50;
export const NEWSLETTER_BATCH_DELAY_MS = 2000;

export interface NewsletterCampaignJobData {
  campaignId: string;
}
