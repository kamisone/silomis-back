import { z } from 'zod';

export const MfaSendSchema = z.object({
  challengeToken: z.string().min(1),
  method: z.enum(['email', 'sms']).optional(),
});

export type MfaSendDto = z.infer<typeof MfaSendSchema>;
