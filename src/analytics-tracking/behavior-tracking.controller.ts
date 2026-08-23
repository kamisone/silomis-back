import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { extractIp } from '../common/utils/client-ip.util';
import { deviceFromUserAgent } from '../common/utils/device.util';
import { resolveTrafficSource } from '../common/utils/traffic-source.util';
import { BehaviorTrackingService } from './behavior-tracking.service';
import { TrackBehaviorDto, TrackBehaviorSchema } from './dto/track-behavior.dto';

@Public()
@Controller('public/shop/behavior')
export class BehaviorTrackingController {
  constructor(private readonly tracking: BehaviorTrackingService) {}

  @Post('track')
  @HttpCode(204)
  async track(@Body(new ZodValidationPipe(TrackBehaviorSchema)) dto: TrackBehaviorDto, @Req() req: Request): Promise<void> {
    const userAgent = req.headers['user-agent'] ?? '';
    await this.tracking.record({
      eventType: dto.eventType,
      productId: dto.productId ?? null,
      searchQuery: dto.searchQuery ?? null,
      resultCount: dto.resultCount ?? null,
      cartToken: dto.cartToken ?? null,
      clientIp: extractIp(req),
      userAgent,
      device: deviceFromUserAgent(userAgent),
      source: dto.source ?? resolveTrafficSource(req.headers.referer ?? null, undefined),
    });
  }
}
