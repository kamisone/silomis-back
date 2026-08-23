import { z } from 'zod';
import { UpsertTranslationSchema } from './upsert-translation.dto';

export const BulkUpsertTranslationSchema = z.object({
  items: z.array(UpsertTranslationSchema).min(1, 'items must not be empty'),
});

export type BulkUpsertTranslationDto = z.infer<typeof BulkUpsertTranslationSchema>;
