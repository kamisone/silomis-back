import { z } from 'zod';

/**
 * Providers an admin may configure through the UI. A closed list, not free
 * text: `provider` is the table's primary key, so an arbitrary value would let
 * the endpoint write rows nothing ever reads.
 */
export const CONFIGURABLE_PROVIDERS = ['sendcloud'] as const;
export type ConfigurableProvider = (typeof CONFIGURABLE_PROVIDERS)[number];

export const ProviderParamSchema = z.enum(CONFIGURABLE_PROVIDERS);

/**
 * Sendcloud API key pair. Stored as one encrypted JSON blob under provider
 * `sendcloud` — see SendcloudPickupPointProvider, the only consumer.
 *
 * The public key is safe to expose; the secret key never is, which is why both
 * live here rather than in environment configuration.
 */
export const SendcloudCredentialsSchema = z.object({
  publicKey: z.string().trim().min(1).max(200),
  secretKey: z.string().trim().min(1).max(200),
});
export type SendcloudCredentialsDto = z.infer<typeof SendcloudCredentialsSchema>;

/** Per-provider payload schema, so each provider validates its own shape. */
export const PROVIDER_SCHEMAS: Record<ConfigurableProvider, z.ZodTypeAny> = {
  sendcloud: SendcloudCredentialsSchema,
};
