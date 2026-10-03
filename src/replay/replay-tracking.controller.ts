import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { extractIp } from '../common/utils/client-ip.util';
import { deviceFromUserAgent } from '../common/utils/device.util';
import { platformFromSource } from '../common/utils/traffic-source.util';
import { ReplayTrackingService } from './replay-tracking.service';
import {
  StartReplaySessionDto,
  StartReplaySessionSchema,
  IngestReplayBatchDto,
  IngestReplayBatchSchema,
  EndReplaySessionDto,
  EndReplaySessionSchema,
} from './dto/replay.dto';

@Public()
@Controller('public/shop/replay/sessions')
export class ReplayTrackingController {
  constructor(private readonly replay: ReplayTrackingService) {}

  @Post()
  start(@Body(new ZodValidationPipe(StartReplaySessionSchema)) dto: StartReplaySessionDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    // Device and acquisition channel are derived here exactly as
    // BehaviorTrackingController does, so these columns stay comparable
    // across the replay and behaviour-event tables. The channel comes from
    // the recorder's first-touch referrer/utm_source, not this request's
    // Referer — that is always our own page.
    return this.replay.startSession(dto, {
      ip: extractIp(req),
      userAgent,
      device: deviceFromUserAgent(userAgent),
      source: platformFromSource(dto.referrer, dto.utmSource),
    });
  }

  @Post(':id/events')
  @HttpCode(204)
  async ingest(@Param('id') id: string, @Body(new ZodValidationPipe(IngestReplayBatchSchema)) dto: IngestReplayBatchDto): Promise<void> {
    await this.replay.ingestBatch(id, dto);
  }

  // Reached via sendBeacon on page unload, so no Authorization header is
  // attached — @Public() like every other ingest route here, which is a
  // storefront visitor rather than an admin either way.
  @Post(':id/end')
  @HttpCode(204)
  async end(@Param('id') id: string, @Body(new ZodValidationPipe(EndReplaySessionSchema)) dto: EndReplaySessionDto): Promise<void> {
    await this.replay.endSession(id, dto.markers);
  }
}
