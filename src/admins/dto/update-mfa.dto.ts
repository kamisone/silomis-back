import { z } from 'zod';

export const UpdateMfaSchema = z.object({
  mfaEnabled: z.boolean(),
  preferredMfaMethod: z.enum(['email', 'sms']).optional(),
  phone: z.string().min(1).nullable().optional(),
});

export type UpdateMfaDto = z.infer<typeof UpdateMfaSchema>;
