import { ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { PrismaService } from '../prisma/prisma.service';
import { SendcloudCredentialsSchema, ProviderParamSchema } from './dto/integration-credential.dto';

/** In-memory stand-in for the integration_credentials table. */
function fakePrisma() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    prisma: {
      integrationCredential: {
        upsert: jest.fn(({ where, create, update }: never) => {
          const w = where as { provider: string };
          const existing = rows.get(w.provider);
          rows.set(w.provider, { ...(existing ?? (create as object)), ...(update as object), provider: w.provider, updatedAt: new Date() });
          return Promise.resolve(rows.get(w.provider));
        }),
        findUnique: jest.fn(({ where }: never) => Promise.resolve(rows.get((where as { provider: string }).provider) ?? null)),
        delete: jest.fn(({ where }: never) => {
          rows.delete((where as { provider: string }).provider);
          return Promise.resolve({});
        }),
      },
    } as unknown as PrismaService,
  };
}

const KEY = crypto.randomBytes(32).toString('base64');

describe('IntegrationCredentialsService', () => {
  const original = process.env.INTEGRATION_CREDENTIALS_MASTER_KEY;

  beforeEach(() => {
    process.env.INTEGRATION_CREDENTIALS_MASTER_KEY = KEY;
  });

  afterAll(() => {
    process.env.INTEGRATION_CREDENTIALS_MASTER_KEY = original;
  });

  it('round-trips a secret through encryption', async () => {
    const { prisma } = fakePrisma();
    const service = new IntegrationCredentialsService(prisma);
    const secret = JSON.stringify({ publicKey: 'pub', secretKey: 'shhh' });

    await service.set('sendcloud', secret, 'admin@example.com');

    await expect(service.get('sendcloud')).resolves.toBe(secret);
  });

  it('never stores the plaintext', async () => {
    const { prisma, rows } = fakePrisma();
    const service = new IntegrationCredentialsService(prisma);

    await service.set('sendcloud', JSON.stringify({ privateKey: 'super-secret-value' }));

    expect(JSON.stringify([...rows.values()])).not.toContain('super-secret-value');
  });

  it('describe reports status without exposing the secret', async () => {
    const { prisma } = fakePrisma();
    const service = new IntegrationCredentialsService(prisma);
    await service.set('sendcloud', JSON.stringify({ privateKey: 'super-secret-value' }), 'admin@example.com');

    const described = await service.describe('sendcloud');

    expect(described).toMatchObject({ provider: 'sendcloud', isConfigured: true, encryptionReady: true, updatedBy: 'admin@example.com' });
    // The whole point of the endpoint: no field anywhere carries the value.
    expect(JSON.stringify(described)).not.toContain('super-secret-value');
    expect(Object.keys(described).sort()).toEqual(['encryptionReady', 'isConfigured', 'provider', 'updatedAt', 'updatedBy']);
  });

  it('reports an unconfigured provider rather than failing', async () => {
    const { prisma } = fakePrisma();
    const service = new IntegrationCredentialsService(prisma);

    await expect(service.describe('sendcloud')).resolves.toMatchObject({ isConfigured: false, updatedAt: null, updatedBy: null });
    await expect(service.get('sendcloud')).resolves.toBeNull();
  });

  it('clearing returns the provider to its unconfigured state', async () => {
    const { prisma } = fakePrisma();
    const service = new IntegrationCredentialsService(prisma);
    await service.set('sendcloud', JSON.stringify({ privateKey: 'x' }));

    await service.remove('sendcloud');

    await expect(service.describe('sendcloud')).resolves.toMatchObject({ isConfigured: false });
  });

  describe('master key', () => {
    it('flags a deployment with no key instead of throwing from describe', async () => {
      delete process.env.INTEGRATION_CREDENTIALS_MASTER_KEY;
      const { prisma } = fakePrisma();
      const service = new IntegrationCredentialsService(prisma);

      await expect(service.describe('sendcloud')).resolves.toMatchObject({ encryptionReady: false });
    });

    it('refuses to store a secret with no key, as ServiceUnavailable', async () => {
      delete process.env.INTEGRATION_CREDENTIALS_MASTER_KEY;
      const { prisma } = fakePrisma();
      const service = new IntegrationCredentialsService(prisma);

      await expect(service.set('sendcloud', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('rejects a key that is not 32 bytes', async () => {
      process.env.INTEGRATION_CREDENTIALS_MASTER_KEY = Buffer.alloc(16).toString('base64');
      const { prisma } = fakePrisma();
      const service = new IntegrationCredentialsService(prisma);

      await expect(service.set('sendcloud', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});

describe('credential DTOs', () => {
  it('accepts only known providers', () => {
    expect(ProviderParamSchema.safeParse('sendcloud').success).toBe(true);
    // provider is the table's primary key — free text would let the endpoint
    // write rows nothing ever reads.
    expect(ProviderParamSchema.safeParse('anything_else').success).toBe(false);
  });

  it('requires both Sendcloud keys', () => {
    expect(SendcloudCredentialsSchema.safeParse({ publicKey: 'p', secretKey: 's' }).success).toBe(true);
    expect(SendcloudCredentialsSchema.safeParse({ publicKey: 'p' }).success).toBe(false);
    expect(SendcloudCredentialsSchema.safeParse({ publicKey: '', secretKey: 's' }).success).toBe(false);
  });

  it('trims surrounding whitespace, which is easy to paste in', () => {
    expect(SendcloudCredentialsSchema.parse({ publicKey: '  p ', secretKey: ' s ' })).toMatchObject({ publicKey: 'p', secretKey: 's' });
  });
});
