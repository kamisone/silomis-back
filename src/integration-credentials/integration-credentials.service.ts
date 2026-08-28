import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Encrypted-at-rest secret storage for third-party integrations. Deliberately
 * its own table rather than platform_settings: that table is served in full by
 * a public endpoint and cached in-memory, neither of which is safe for a
 * secret. First consumer is the Mondial Relay pickup-point adapter.
 *
 * `get` is for server-side consumers only. Nothing exposes a stored secret
 * over HTTP — the admin API can set and clear one, and otherwise only ask
 * whether it exists (see `describe`).
 *
 * AES-256-GCM, keyed by INTEGRATION_CREDENTIALS_MASTER_KEY (32 bytes,
 * base64). Rotate the key by bumping keyVersion and re-encrypting.
 */
@Injectable()
export class IntegrationCredentialsService {
  private readonly logger = new Logger(IntegrationCredentialsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async set(provider: string, secret: string, updatedBy?: string): Promise<void> {
    const key = this.masterKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    await this.prisma.integrationCredential.upsert({
      where: { provider },
      create: {
        provider,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        updatedBy: updatedBy ?? null,
      },
      update: {
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        updatedBy: updatedBy ?? null,
      },
    });
    this.logger.log(`Integration credential updated for provider="${provider}"`);
  }

  async get(provider: string): Promise<string | null> {
    const row = await this.prisma.integrationCredential.findUnique({ where: { provider } });
    if (!row) return null;

    const key = this.masterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  }

  /**
   * Whether a secret exists, and who last touched it — never the secret.
   * This is everything the admin UI is allowed to know: a stored credential is
   * write-only from the outside, so a compromised admin session cannot read
   * back a key it did not already have.
   */
  async describe(provider: string): Promise<{ provider: string; isConfigured: boolean; encryptionReady: boolean; updatedAt: string | null; updatedBy: string | null }> {
    const row = await this.prisma.integrationCredential.findUnique({
      where: { provider },
      select: { provider: true, updatedAt: true, updatedBy: true },
    });
    return {
      provider,
      isConfigured: !!row,
      // Surfaced so the UI can say "this deployment can't store secrets"
      // before an admin types one, rather than after the save fails.
      encryptionReady: this.isEncryptionReady(),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  /** True when a usable master key is present — checked without ever logging or returning it. */
  private isEncryptionReady(): boolean {
    try {
      this.masterKey();
      return true;
    } catch {
      return false;
    }
  }

  async remove(provider: string): Promise<void> {
    await this.prisma.integrationCredential.delete({ where: { provider } }).catch(() => {});
  }

  /**
   * ServiceUnavailable rather than a bare Error: a missing key is a deployment
   * configuration problem, and every caller (admin API, carrier adapters)
   * should report "integration not available" instead of an opaque 500.
   */
  private masterKey(): Buffer {
    const raw = process.env.INTEGRATION_CREDENTIALS_MASTER_KEY;
    if (!raw) throw new ServiceUnavailableException('INTEGRATION_CREDENTIALS_MASTER_KEY is not set');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('INTEGRATION_CREDENTIALS_MASTER_KEY must decode to 32 bytes');
    return key;
  }
}
