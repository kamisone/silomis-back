import { z } from 'zod';

export const CreateFilterValueSchema = z.object({
  value: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateFilterValueDto = z.infer<typeof CreateFilterValueSchema>;

export const UpdateFilterValueSchema = CreateFilterValueSchema.partial();
export type UpdateFilterValueDto = z.infer<typeof UpdateFilterValueSchema>;

/**
 * A filter needs at least one value to have anything to default to — the
 * whole point of a category filter is that every product in the category
 * carries one of its values. `.partial()`-safe: none of these fields carry a
 * `.default()`, which would otherwise get injected into a PATCH that never
 * touched them (see the option-value/attribute drift this repo already hit).
 */
export const CreateCategoryFilterSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  values: z.array(CreateFilterValueSchema).min(1),
});
export type CreateCategoryFilterDto = z.infer<typeof CreateCategoryFilterSchema>;

export const UpdateCategoryFilterSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryFilterDto = z.infer<typeof UpdateCategoryFilterSchema>;
