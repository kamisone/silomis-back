import { z } from 'zod';

export const CreateAdminSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  /** Reached by admin SMS alerts (orders, low stock, support) and SMS 2FA. */
  phone: z.string().max(32).nullish(),
  role: z.enum(['admin', 'superadmin']).optional(),
});

export type CreateAdminDto = z.infer<typeof CreateAdminSchema>;
