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

export const IngestReplayBatchSchema = z.object({
  /** Raw rrweb event objects — validated only at the array/size level; sensitive-data scanning happens on the parsed payload, not via schema shape. */
  events: z.array(z.record(z.string(), z.unknown())).default([]),
  markers: z
    .array(
      z.object({
        type: z.enum(['click', 'scroll', 'navigation']),
        timestampMs: z.number().int().min(0),
        label: z.string().max(500).nullish(),
        meta: z.record(z.string(), z.unknown()).nullish(),
      }),
    )
    .default([]),
});
export type IngestReplayBatchDto = z.infer<typeof IngestReplayBatchSchema>;
