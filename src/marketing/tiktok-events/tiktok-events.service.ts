import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import {
  TIKTOK_EVENTS_QUEUE,
  TikTokEventJobData,
  TikTokEventName,
} from './tiktok-events.constants';

export interface SendTikTokEventInput {
  eventName: TikTokEventName;
  /** Shared with the matching browser ttq('track', …) call's event ID for TikTok's dedup. */
  eventId: string;
  eventSourceUrl: string;
  /** value/currency/content identifiers only — never customer PII. */
  properties: Record<string, unknown>;
  email?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
}

/**
 * Single entry point for sending any TikTok Events API event — mirrors
 * MetaCapiService exactly (see back/src/marketing/meta-capi/meta-capi.service.ts):
 * used by TikTokEventsOrderListener (Purchase, InitiateCheckout) and directly
 * by CartService (AddToCart) and TikTokEventsTrackController
 * (ViewContent/Search, client-driven events with no backend mutation to hook
 * into).
 *
 * Only ever forwards value/currency/content identifiers + a hashed
 * email/IP/UA/ttclid/ttp — never name, phone, address, or other customer data.
 * See tiktok-events.processor.ts for the actual HTTP call.
 */
@Injectable()
export class TikTokEventsService {
  private readonly logger = new Logger(TikTokEventsService.name);

  constructor(
    @InjectQueue(TIKTOK_EVENTS_QUEUE) private readonly queue: Queue,
    private readonly settings: PlatformSettingsService,
  ) {}

  async sendEvent(input: SendTikTokEventInput): Promise<void> {
    const { pixelId, enabled } = this.settings.getTikTokPixelConfig();
    if (!enabled || !pixelId || !process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN)
      return;

    try {
      const jobData: TikTokEventJobData = {
        eventName: input.eventName,
        eventId: input.eventId,
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: input.eventSourceUrl,
        properties: input.properties,
        customerEmailHash: input.email
          ? createHash('sha256')
              .update(input.email.trim().toLowerCase())
              .digest('hex')
          : null,
        clientIpAddress: input.clientIpAddress ?? null,
        clientUserAgent: input.clientUserAgent ?? null,
        ttclid: input.ttclid ?? null,
        ttp: input.ttp ?? null,
      };

      await this.queue.add(input.eventName, jobData, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    } catch (err) {
      this.logger.error(
        `Failed to enqueue TikTok Events API ${input.eventName} event: ${(err as Error).message}`,
      );
    }
  }
}
