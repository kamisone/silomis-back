import { z } from 'zod';

export const CreateContactSchema = z.object({
  // ── Core fields (stored)
  name: z.string().min(1, 'Name is required').max(200).trim(),
  contact: z.string().min(1, 'Contact is required').max(200).trim(),
  subject: z.string().min(1, 'Subject is required').max(300).trim(),
  message: z.string().min(1, 'Message is required').max(5000).trim(),
  // ── Anti-spam metadata (evaluated then discarded, never stored)
  _hp: z.string().max(500).optional(),
  _t: z.number().int().positive().optional(),
  _token: z.string().max(2500).optional(),
});

export type CreateContactDto = z.infer<typeof CreateContactSchema>;
