import { z } from 'zod';

export const UpsertTranslationSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1),
  field: z.string().min(1).max(100),
  value: z.string().min(1),
  lang: z.string().min(1).max(10),
});

export type UpsertTranslationDto = z.infer<typeof UpsertTranslationSchema>;
