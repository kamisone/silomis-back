import { z } from 'zod';

export const UpsertZoneSchema = z.object({
  name: z.string().min(1).max(200),
  countryCodes: z.array(z.string().min(2).max(2)),
  isActive: z.boolean().optional(),
  surchargeCents: z.number().int().min(0).optional(),
  freeShippingThresholdCents: z.number().int().min(0).nullish(),
  estimatedDeliveryDays: z.string().max(100).nullish(),
});
export type UpsertZoneDto = z.infer<typeof UpsertZoneSchema>;

export const UpdateZoneSchema = UpsertZoneSchema.partial();
export type UpdateZoneDto = z.infer<typeof UpdateZoneSchema>;

export const UpsertMethodSchema = z.object({
  zoneId: z.string().uuid(),
  name: z.string().min(1).max(200),
  carrier: z.string().max(200).nullish(),
  priceCents: z.number().int().min(0),
  freeAboveCents: z.number().int().min(0).nullish(),
  estimatedDaysMin: z.number().int().min(0).optional(),
  estimatedDaysMax: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  availableForFreeShipping: z.boolean().optional(),
});
export type UpsertMethodDto = z.infer<typeof UpsertMethodSchema>;

export const UpdateMethodSchema = UpsertMethodSchema.partial();
export type UpdateMethodDto = z.infer<typeof UpdateMethodSchema>;

export const UpdateShippingSchema = z.object({
  shippingMethodId: z.string().min(1),
});
export type UpdateShippingDto = z.infer<typeof UpdateShippingSchema>;

export const UpsertShipmentSchema = z.object({
  orderId: z.string().uuid(),
  methodId: z.string().uuid().nullish(),
  status: z.enum(['pending', 'label_created', 'in_transit', 'delivered', 'failed']).optional(),
  carrier: z.string().max(200).nullish(),
  trackingNumber: z.string().max(300).nullish(),
  trackingUrl: z.string().max(2000).nullish(),
  estimatedDeliveryAt: z.coerce.date().nullish(),
});
export type UpsertShipmentDto = z.infer<typeof UpsertShipmentSchema>;

export const UpdateShipmentSchema = UpsertShipmentSchema.partial().omit({ orderId: true });
export type UpdateShipmentDto = z.infer<typeof UpdateShipmentSchema>;
