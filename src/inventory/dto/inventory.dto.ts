import { z } from 'zod';

export const AdjustStockSchema = z.object({
  delta: z.number().int().refine((d) => d !== 0, 'delta must not be zero'),
  // Optional, like bulk-adjust's: the note is a reason for the movement log,
  // not something an admin must type to change a number. A blank one gets the
  // same default the inventory page already sent.
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((n) => n || 'Manual adjustment'),
});
export type AdjustStockDto = z.infer<typeof AdjustStockSchema>;

export const UpdateInventorySettingsSchema = z.object({
  lowStockThreshold: z.number().int().min(0).optional(),
  incoming: z.number().int().min(0).optional(),
});
export type UpdateInventorySettingsDto = z.infer<typeof UpdateInventorySettingsSchema>;

export const BulkAdjustSchema = z.object({
  adjustments: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        delta: z.number().int().refine((d) => d !== 0, 'delta must not be zero'),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1),
});
export type BulkAdjustDto = z.infer<typeof BulkAdjustSchema>;
