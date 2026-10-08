import { z } from 'zod';
import { isPlausiblePhone } from '../../common/utils/phone';

const AddressSchema = z.object({
  name: z.string().max(300),
  line1: z.string().max(500),
  line2: z.string().max(500).nullish(),
  city: z.string().max(200),
  zip: z.string().max(20),
  country: z.string().max(10),
});

export const CreateOrderSchema = z
  .object({
    cartToken: z.string().uuid(),
    /** Email OR phone, as at checkout — see InitiateCheckoutSchema. */
    customerEmail: z.email().max(300).nullish(),
    customerName: z.string().max(300).nullish(),
    customerPhone: z.string().max(50).refine(isPlausiblePhone, 'Invalid phone number').nullish(),
    shippingAddress: AddressSchema,
    billingAddress: AddressSchema.nullish(),
    shippingMethodId: z.string().uuid().nullish(),
    userId: z.string().uuid().nullish(),
  })
  .refine((d) => !!d.customerEmail || !!d.customerPhone, {
    path: ['customerEmail'],
    message: 'Provide an email address or a phone number',
  });
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export interface OrderListFilter {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
