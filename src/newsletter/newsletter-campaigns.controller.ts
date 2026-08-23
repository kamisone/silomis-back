import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import {
  AudiencePreviewDto,
  AudiencePreviewSchema,
  CreateCampaignDto,
  CreateCampaignSchema,
  ScheduleCampaignDto,
  ScheduleCampaignSchema,
  SendTestEmailDto,
  SendTestEmailSchema,
  UpdateCampaignDto,
  UpdateCampaignSchema,
} from './dto/campaign.dto';
import { NewsletterCampaignStatus } from '../../generated/prisma/client';

@Controller('admin/newsletter/campaigns')
export class NewsletterCampaignsController {
  constructor(private readonly service: NewsletterCampaignsService) {}

  @Get()
  list(
    @Query('status') status?: NewsletterCampaignStatus,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.list({
      status,
      type,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // Static route — must come before the `:id` route below.
  @Post('audience-preview')
  async audiencePreview(
    @Body(new ZodValidationPipe(AudiencePreviewSchema)) dto: AudiencePreviewDto,
  ) {
    const count = await this.service.previewAudienceCount(dto.audience);
    return { count };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateCampaignSchema)) dto: CreateCampaignDto,
  ) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCampaignSchema)) dto: UpdateCampaignDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.service.duplicate(id);
  }

  @Post(':id/schedule')
  schedule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ScheduleCampaignSchema))
    dto: ScheduleCampaignDto,
  ) {
    return this.service.schedule(id, new Date(dto.scheduledAt));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Post(':id/send-now')
  sendNow(@Param('id') id: string) {
    return this.service.sendNow(id);
  }

  @Post(':id/send-test')
  async sendTest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendTestEmailSchema)) dto: SendTestEmailDto,
  ) {
    await this.service.sendTest(id, dto.to);
    return { ok: true };
  }
}
