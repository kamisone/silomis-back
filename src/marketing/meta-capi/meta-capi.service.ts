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
  /** E.164 (+33612345678); anything else is not sent — a national number would hash to nobody. */
  phone?: string | null;
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
 * Only ever forwards value/currency/content identifiers + a hashed email and
 * phone, plus IP/UA/fbc/fbp — never name, address, or other customer data.
 * The phone matters for a customer who checked out without an email: it is
 * then the only identifier Meta can match the purchase on.
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
        // Meta: digits only, country code included, no "+".
        customerPhoneHash: input.phone?.startsWith('+')
          ? createHash('sha256').update(input.phone.replace(/\D/g, '')).digest('hex')
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
