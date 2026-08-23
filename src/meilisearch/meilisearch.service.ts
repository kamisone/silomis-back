import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Thin optional wrapper around the `meilisearch` client. Disabled by default —
 * ProductSearchService falls back to a Postgres full-text query whenever this
 * is disabled, so search works with zero extra infra and upgrades seamlessly
 * once MEILI_HOST is configured and the `meilisearch` package is installed.
 */
@Injectable()
export class MeilisearchService implements OnModuleInit {
  private readonly logger = new Logger(MeilisearchService.name);
  private client: any = null;

  onModuleInit(): void {
    const host = process.env.MEILI_HOST;
    const apiKey = process.env.MEILI_API_KEY ?? '';

    if (!host) {
      this.logger.warn('MEILI_HOST not set — Meilisearch search features disabled');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MeiliSearch } = require('meilisearch');
      this.client = new MeiliSearch({ host, apiKey });
      this.logger.log(`Meilisearch connected to ${host}`);
    } catch {
      this.logger.warn('meilisearch package not installed — run: npm install meilisearch');
    }
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  index(indexName: string): any {
    if (!this.client) return null;
    return this.client.index(indexName);
  }

  async configureIndex(indexName: string, primaryKey: string, settings: Record<string, any>): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.createIndex(indexName, { primaryKey });
    } catch {
      // Already exists — ignore
    }
    await this.client.index(indexName).updateSettings(settings);
  }
}
