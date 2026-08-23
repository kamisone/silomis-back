import { z } from 'zod';

export const MfaVerifySchema = z.object({
  challengeToken: z.string().min(1),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

export type MfaVerifyDto = z.infer<typeof MfaVerifySchema>;
