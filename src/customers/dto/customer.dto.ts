import { z } from 'zod';

export const UpsertAddressSchema = z.object({
  name: z.string().min(1).max(300),
  line1: z.string().min(1).max(500),
  line2: z.string().max(500).nullish(),
  city: z.string().min(1).max(200),
  zip: z.string().min(1).max(20),
  country: z.string().min(2).max(10),
  isDefault: z.boolean().optional(),
});
export type UpsertAddressDto = z.infer<typeof UpsertAddressSchema>;

export const UpdateAddressSchema = UpsertAddressSchema.partial();
export type UpdateAddressDto = z.infer<typeof UpdateAddressSchema>;
