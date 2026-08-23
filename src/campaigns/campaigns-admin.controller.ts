import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, CreateCampaignSchema, UpdateCampaignDto, UpdateCampaignSchema } from './dto/campaign.dto';

@Controller('admin/shop/campaigns')
export class CampaignsAdminController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@Query('isActive') isActive?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.campaigns.list({
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaigns.findOneWithPromotions(id);
  }

  @Get(':id/performance')
  performance(@Param('id') id: string) {
    return this.campaigns.performance(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateCampaignSchema)) dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateCampaignSchema)) dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.campaigns.remove(id);
  }
}
