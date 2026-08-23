import { z } from 'zod';

export const UpdateAdminSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  role: z.enum(['admin', 'superadmin']).optional(),
});

export type UpdateAdminDto = z.infer<typeof UpdateAdminSchema>;
