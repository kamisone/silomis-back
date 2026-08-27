import { z } from 'zod';

export const StartReplaySessionSchema = z.object({
  productId: z.string().uuid(),
  cartToken: z.string().max(100).nullish(),
  viewportWidth: z.number().int().positive().nullish(),
  viewportHeight: z.number().int().positive().nullish(),
  pageUrl: z.string().max(2000).nullish(),
  pageTitle: z.string().max(500).nullish(),
  source: z.string().max(100).nullish(),
});
export type StartReplaySessionDto = z.infer<typeof StartReplaySessionSchema>;

/** Must stay in sync with the ReplayEventType Prisma enum — an unlisted type fails validation and drops the whole batch. */
export const ReplayMarkerSchema = z.object({
  type: z.enum(['session_start', 'session_end', 'click', 'scroll', 'navigation']),
  timestampMs: z.number().int().min(0),
  label: z.string().max(500).nullish(),
  meta: z.record(z.string(), z.unknown()).nullish(),
});
export type ReplayMarkerDto = z.infer<typeof ReplayMarkerSchema>;

export const IngestReplayBatchSchema = z.object({
  /** Raw rrweb event objects — validated only at the array/size level; sensitive-data scanning happens on the parsed payload, not via schema shape. */
  events: z.array(z.record(z.string(), z.unknown())).default([]),
  markers: z.array(ReplayMarkerSchema).default([]),
});
export type IngestReplayBatchDto = z.infer<typeof IngestReplayBatchSchema>;

/**
 * The closing beacon's body. Everything is optional: a recorder from a cached
 * older bundle beacons `/end` with no body at all, which must keep working
 * exactly as before rather than 400.
 */
export const EndReplaySessionSchema = z.object({
  markers: z.array(ReplayMarkerSchema).default([]),
});
export type EndReplaySessionDto = z.infer<typeof EndReplaySessionSchema>;
