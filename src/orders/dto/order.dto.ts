import { z } from 'zod';

const AddressSchema = z.object({
  name: z.string().max(300),
  line1: z.string().max(500),
  line2: z.string().max(500).nullish(),
  city: z.string().max(200),
  zip: z.string().max(20),
  country: z.string().max(10),
});

export const CreateOrderSchema = z.object({
  cartToken: z.string().uuid(),
  customerEmail: z.email().max(300),
  customerName: z.string().max(300).nullish(),
  customerPhone: z.string().max(50).nullish(),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.nullish(),
  shippingMethodId: z.string().uuid().nullish(),
  userId: z.string().uuid().nullish(),
});
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export interface OrderListFilter {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
