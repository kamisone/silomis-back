export const TIKTOK_EVENTS_QUEUE = 'tiktok-events';

// TikTok's standard event codes happen to match Meta's naming for every
// event this app tracks (see https://ads.tiktok.com/help — Standard Events).
export type TikTokEventName =
  | 'ViewContent'
  | 'Search'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'Purchase';

export interface TikTokEventJobData {
  eventName: TikTokEventName;
  eventId: string;
  /** Unix seconds. */
  eventTime: number;
  eventSourceUrl: string;
  /** value/currency/content identifiers only — never customer PII. */
  properties: Record<string, unknown>;
  /** SHA-256 hex digest of the lowercased, trimmed customer email — never the raw email. */
  customerEmailHash: string | null;
  /** Sent as-is, never hashed — TikTok's spec requires these unhashed. */
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  /** ttclid (TikTok Click ID) / _ttp (TikTok Browser ID) cookies, read client-side — sent as-is, never hashed. */
  ttclid: string | null;
  ttp: string | null;
}
