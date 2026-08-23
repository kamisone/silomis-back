import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '../support.constants';

export const SendMessageSchema = z.object({
  content: z
    .string()
    .min(1)
    .max(MAX_MESSAGE_LENGTH)
    .transform((s) => s.trim()),
  clientId: z.string().uuid().optional(), // echo'd back in ACK for optimistic-UI matching
  guestName: z.string().max(80).optional(),
});
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const BootstrapSchema = z.object({
  guestName: z.string().max(80).optional(),
});
export type BootstrapDto = z.infer<typeof BootstrapSchema>;

export const UpdateSettingsSchema = z.object({
  smsEnabled: z.boolean().optional(),
  smsPhones: z.array(z.string().regex(/^\+?[0-9\s\-().]{7,20}$/)).optional(),
  smsCooldownMin: z.number().int().min(1).max(1440).optional(),
  inactiveCloseHours: z.number().int().min(1).max(8760).optional(),
});
export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;

export const AssignSchema = z.object({
  adminId: z.string().uuid().nullable(),
});
export type AssignDto = z.infer<typeof AssignSchema>;

export const StatusSchema = z.object({
  status: z.enum([
    'open',
    'waiting_admin',
    'waiting_guest',
    'closed',
    'archived',
  ]),
  note: z.string().max(500).optional(),
});
export type StatusDto = z.infer<typeof StatusSchema>;
