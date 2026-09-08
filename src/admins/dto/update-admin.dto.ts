import { z } from 'zod';

export const UpdateAdminSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  /** Reached by admin SMS alerts (orders, low stock, support) and SMS 2FA. */
  phone: z.string().max(32).nullish(),
  role: z.enum(['admin', 'superadmin']).optional(),
});

export type UpdateAdminDto = z.infer<typeof UpdateAdminSchema>;
