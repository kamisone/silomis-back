import { Module } from '@nestjs/common';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { InventoryService } from './inventory.service';
import { InventoryAdminController } from './inventory-admin.controller';
import { LowStockAlertListener } from './low-stock-alert.listener';

@Module({
  imports: [AssetUrlModule, EmailModule, SmsModule, PlatformSettingsModule],
  controllers: [InventoryAdminController],
  providers: [InventoryService, LowStockAlertListener],
  exports: [InventoryService],
})
export class InventoryModule {}
