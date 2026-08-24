import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import {
  META_CAPI_QUEUE,
  MetaCapiEventJobData,
  MetaCapiEventName,
} from './meta-capi.constants';

export interface SendMetaCapiEventInput {
  eventName: MetaCapiEventName;
  /** Shared with the matching browser fbq() call's eventID for Meta's dedup. */
  eventId: string;
  eventSourceUrl: string;
  /** value/currency/content identifiers only — never customer PII. */
  customData: Record<string, unknown>;
  email?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
}

/**
 * Single entry point for sending any Meta Conversions API event — used by
 * MetaCapiOrderListener (Purchase, InitiateCheckout) and directly by
 * CartService (AddToCart, which has no natural domain event to react to) and
 * MetaCapiTrackController (ViewContent/Search, client-driven page/query
 * events with no backend mutation to hook into).
 *
 * Only ever forwards value/currency/content identifiers + a hashed
 * email/IP/UA/fbc/fbp — never name, phone, address, or other customer data.
 * See meta-capi.processor.ts for the actual HTTP call.
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  constructor(
    @InjectQueue(META_CAPI_QUEUE) private readonly queue: Queue,
    private readonly settings: PlatformSettingsService,
  ) {}

  async sendEvent(input: SendMetaCapiEventInput): Promise<void> {
    const { pixelId, enabled } = this.settings.getMetaPixelConfig();
    if (!enabled || !pixelId || !process.env.META_CAPI_ACCESS_TOKEN) return;

    try {
      const jobData: MetaCapiEventJobData = {
        eventName: input.eventName,
        eventId: input.eventId,
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: input.eventSourceUrl,
        customData: input.customData,
        customerEmailHash: input.email
          ? createHash('sha256')
              .update(input.email.trim().toLowerCase())
              .digest('hex')
          : null,
        clientIpAddress: input.clientIpAddress ?? null,
        clientUserAgent: input.clientUserAgent ?? null,
        fbc: input.fbc ?? null,
        fbp: input.fbp ?? null,
      };

      await this.queue.add(input.eventName, jobData, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    } catch (err) {
      this.logger.error(
        `Failed to enqueue Meta CAPI ${input.eventName} event: ${(err as Error).message}`,
      );
    }
  }
}
