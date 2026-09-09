import { Body, Controller, Get, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { extractIp, ORIGINAL_CLIENT_IP_HEADER } from '../common/utils/client-ip.util';
import { deviceFromUserAgent } from '../common/utils/device.util';
import { resolveTrafficSource } from '../common/utils/traffic-source.util';
import { GeoIpService } from './geo-ip.service';
import { BehaviorTrackingService } from './behavior-tracking.service';
import { TrackBehaviorDto, TrackBehaviorSchema } from './dto/track-behavior.dto';

@Public()
@Controller('public/shop/behavior')
export class BehaviorTrackingController {
  private readonly logger = new Logger(BehaviorTrackingController.name);

  constructor(
    private readonly tracking: BehaviorTrackingService,
    private readonly geoIp: GeoIpService,
  ) {}

  /**
   * Diagnostic: what this service sees as the caller's address, and what that
   * resolves to. Echoes only the caller's own request metadata — nothing about
   * anyone else — so it is safe to leave public.
   *
   * Hit it through each entry point to find the hop that loses the address:
   *   /public/shop/behavior/ip-debug           (edge -> ingress -> backend)
   *   /next-api/public/shop/behavior/ip-debug  (edge -> ingress -> Next -> backend)
   *
   * A private or null `resolvedIp` on the first means the edge/ingress chain is
   * dropping it — check that ingress-nginx picked up
   * docker/k8s/ingress-nginx-configmap.yaml (`use-forwarded-headers: "true"`)
   * and that the edge nginx still stamps X-Original-Client-IP. A good first
   * result but a bad second means the Next proxy is not passing it on.
   */
  @Get('ip-debug')
  ipDebug(@Req() req: Request) {
    const ip = extractIp(req);
    return {
      resolvedIp: ip,
      rawReqIp: req.ip ?? null,
      resolvedCountry: this.geoIp.countryFromIp(ip),
      // False means every event written from this hop lands with a NULL country.
      usable: !!ip,
      received: {
        'x-forwarded-for': req.headers['x-forwarded-for'] ?? null,
        'x-real-ip': req.headers['x-real-ip'] ?? null,
        [ORIGINAL_CLIENT_IP_HEADER]: req.headers[ORIGINAL_CLIENT_IP_HEADER] ?? null,
      },
    };
  }

  @Post('track')
  @HttpCode(204)
  async track(@Body(new ZodValidationPipe(TrackBehaviorSchema)) dto: TrackBehaviorDto, @Req() req: Request): Promise<void> {
    const userAgent = req.headers['user-agent'] ?? '';
    const clientIp = extractIp(req);

    if (!this.geoIp.countryFromIp(clientIp)) {
      // The only way to tell "a visitor we cannot geolocate" apart from "a hop
      // is swallowing every address" is to see the chain, so log it once here
      // rather than leaving a table of NULL countries as the only symptom.
      this.logger.warn(
        `No country for behaviour event: resolved=${clientIp} req.ip=${req.ip} ` +
          `x-forwarded-for="${(req.headers['x-forwarded-for'] as string) ?? ''}" ` +
          `${ORIGINAL_CLIENT_IP_HEADER}="${(req.headers[ORIGINAL_CLIENT_IP_HEADER] as string) ?? ''}"`,
      );
    }

    await this.tracking.record({
      eventType: dto.eventType,
      productId: dto.productId ?? null,
      searchQuery: dto.searchQuery ?? null,
      resultCount: dto.resultCount ?? null,
      cartToken: dto.cartToken ?? null,
      clientIp,
      userAgent,
      device: deviceFromUserAgent(userAgent),
      source: dto.source ?? resolveTrafficSource(req.headers.referer ?? null, undefined),
    });
  }
}
