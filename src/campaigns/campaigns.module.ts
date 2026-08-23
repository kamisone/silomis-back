import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignsAdminController } from './campaigns-admin.controller';

@Module({
  providers: [CampaignsService],
  controllers: [CampaignsAdminController],
  exports: [CampaignsService],
})
export class CampaignsModule {}
