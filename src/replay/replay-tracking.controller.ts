import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { extractIp } from '../common/utils/client-ip.util';
import { ReplayTrackingService } from './replay-tracking.service';
import { StartReplaySessionDto, StartReplaySessionSchema, IngestReplayBatchDto, IngestReplayBatchSchema } from './dto/replay.dto';

@Public()
@Controller('public/shop/replay/sessions')
export class ReplayTrackingController {
  constructor(private readonly replay: ReplayTrackingService) {}

  @Post()
  start(@Body(new ZodValidationPipe(StartReplaySessionSchema)) dto: StartReplaySessionDto, @Req() req: Request) {
    return this.replay.startSession(dto, { ip: extractIp(req), userAgent: req.headers['user-agent'] });
  }

  @Post(':id/events')
  @HttpCode(204)
  async ingest(@Param('id') id: string, @Body(new ZodValidationPipe(IngestReplayBatchSchema)) dto: IngestReplayBatchDto): Promise<void> {
    await this.replay.ingestBatch(id, dto);
  }

  @Post(':id/end')
  @HttpCode(204)
  async end(@Param('id') id: string): Promise<void> {
    await this.replay.endSession(id);
  }
}
