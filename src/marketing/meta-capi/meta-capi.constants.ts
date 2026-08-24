export const META_CAPI_QUEUE = 'meta-capi-events';

export type MetaCapiEventName =
  | 'ViewContent'
  | 'Search'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'Purchase';

export interface MetaCapiEventJobData {
  eventName: MetaCapiEventName;
  eventId: string;
  eventTime: number;
  eventSourceUrl: string;
  /** value/currency/content identifiers only — never customer PII. */
  customData: Record<string, unknown>;
  /** SHA-256 hex digest of the lowercased, trimmed customer email — never the raw email. */
  customerEmailHash: string | null;
  /** Sent as-is, never hashed — Meta's spec requires these unhashed. */
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  /** _fbc / _fbp cookies, read client-side — sent as-is, never hashed. */
  fbc: string | null;
  fbp: string | null;
}
