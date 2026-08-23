import { z } from 'zod';

const StatusSchema = z.enum(['subscribed', 'unsubscribed', 'bounced']);

export const CreateSubscriberAdminSchema = z.object({
  email: z.string().email('Invalid email').max(255).trim(),
  locale: z.string().max(5).optional(),
  status: StatusSchema.optional(),
  source: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).optional(),
});
export type CreateSubscriberAdminDto = z.infer<
  typeof CreateSubscriberAdminSchema
>;

export const UpdateSubscriberSchema = CreateSubscriberAdminSchema.partial();
export type UpdateSubscriberDto = z.infer<typeof UpdateSubscriberSchema>;

export const BulkSubscriberActionSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
    action: z.enum([
      'unsubscribe',
      'resubscribe',
      'delete',
      'add_tag',
      'remove_tag',
    ]),
    tag: z.string().max(50).optional(),
  })
  .refine(
    (data) =>
      (data.action !== 'add_tag' && data.action !== 'remove_tag') || !!data.tag,
    {
      message: 'tag is required for add_tag/remove_tag actions',
      path: ['tag'],
    },
  );
export type BulkSubscriberActionDto = z.infer<
  typeof BulkSubscriberActionSchema
>;
