import { z } from 'zod';

export const CreateReturnRequestSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().max(1000).nullish(),
  adminNote: z.string().max(2000).nullish(),
  restockOnComplete: z.boolean().default(true),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
});
export type CreateReturnRequestDto = z.infer<typeof CreateReturnRequestSchema>;

export const TransitionReturnRequestSchema = z.object({
  status: z.enum(['approved', 'rejected', 'refunded', 'restocked']),
  note: z.string().max(2000).nullish(),
});
export type TransitionReturnRequestDto = z.infer<typeof TransitionReturnRequestSchema>;
