import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { extractIp } from '../../common/utils/client-ip.util';
import { MetaCapiService } from './meta-capi.service';

// Restricted to page/query-view events with no backend mutation to hook into
// (ViewContent, Search) — AddToCart/InitiateCheckout/Purchase are sent from
// their own authoritative backend flows (cart, checkout, payment), never
// accepted as arbitrary client-supplied event names here.
const TrackEventSchema = z.object({
  eventName: z.enum(['ViewContent', 'Search']),
  eventId: z.string().min(1).max(200),
  eventSourceUrl: z.string().url().max(2000),
  customData: z.record(z.string(), z.unknown()).optional().default({}),
  fbc: z.string().max(500).nullish(),
  fbp: z.string().max(500).nullish(),
});
type TrackEventDto = z.infer<typeof TrackEventSchema>;

@Public()
@Controller('shop/meta-capi')
export class MetaCapiTrackController {
  constructor(private readonly metaCapi: MetaCapiService) {}

  @Post('track')
  @HttpCode(204)
  async track(
    @Body(new ZodValidationPipe(TrackEventSchema)) dto: TrackEventDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.metaCapi.sendEvent({
      eventName: dto.eventName,
      eventId: dto.eventId,
      eventSourceUrl: dto.eventSourceUrl,
      customData: dto.customData,
      clientIpAddress: extractIp(req),
      clientUserAgent: req.headers['user-agent'] ?? null,
      fbc: dto.fbc,
      fbp: dto.fbp,
    });
  }
}
