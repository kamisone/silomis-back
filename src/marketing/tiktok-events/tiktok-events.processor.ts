import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqAwareWorker } from '../../dlq/dlq-aware.worker';
import { DlqService } from '../../dlq/dlq.service';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import {
  TIKTOK_EVENTS_QUEUE,
  TikTokEventJobData,
} from './tiktok-events.constants';

/**
 * Sends any TikTok Events API event (ViewContent, Search, AddToCart,
 * InitiateCheckout, Purchase) — mirrors MetaCapiProcessor exactly (see
 * back/src/marketing/meta-capi/meta-capi.processor.ts). Only value/currency/
 * content identifiers + a pre-hashed email/IP/UA/ttclid/ttp are ever sent
 * (see tiktok-events.service.ts) — do not add name, phone, address, or any
 * other customer data here without legal review.
 *
 * A failed call throws so BullMQ's retry/backoff and DlqAwareWorker's
 * dead-letter handling can take over — losing an analytics event is fine to
 * retry, never fine to silently drop without a trace.
 */
@Processor(TIKTOK_EVENTS_QUEUE)
export class TikTokEventsProcessor extends DlqAwareWorker {
  protected readonly queueName = TIKTOK_EVENTS_QUEUE;
  private readonly logger = new Logger(TikTokEventsProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly settings: PlatformSettingsService,
  ) {
    super(dlqService);
  }

  async process(job: Job<TikTokEventJobData>): Promise<void> {
    const { pixelId } = this.settings.getTikTokPixelConfig();
    const token = process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN;
    if (!pixelId || !token) {
      this.logger.warn(
        `TikTok Events API job skipped (${job.data.eventName}): pixel code or access token not configured`,
      );
      return;
    }

    const data = job.data;

    // ip / user_agent / ttclid / ttp are sent as-is, never hashed — only
    // fields like email/phone/external_id get SHA-256'd per TikTok's spec.
    const user: Record<string, unknown> = {};
    if (data.customerEmailHash) user.email = data.customerEmailHash;
    if (data.clientIpAddress) user.ip = data.clientIpAddress;
    if (data.clientUserAgent) user.user_agent = data.clientUserAgent;
    if (data.ttclid) user.ttclid = data.ttclid;
    if (data.ttp) user.ttp = data.ttp;

    const body = {
      event_source: 'web',
      event_source_id: pixelId,
      data: [
        {
          event: data.eventName,
          event_time: data.eventTime,
          event_id: data.eventId,
          user,
          properties: data.properties,
          page: { url: data.eventSourceUrl },
        },
      ],
    };

    const res = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/event/track/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Access-Token': token },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );

    const resBody = await res.json().catch(() => null);
    // TikTok returns HTTP 200 with a non-zero `code` on application-level
    // failures (bad pixel code, malformed event, etc.) — a 200 alone doesn't
    // mean the event was accepted.
    if (
      !res.ok ||
      (resBody &&
        typeof resBody === 'object' &&
        'code' in resBody &&
        resBody.code !== 0)
    ) {
      throw new Error(
        `TikTok Events API request failed (${res.status}) for ${data.eventName}: ${JSON.stringify(resBody)}`,
      );
    }
  }
}
