import { Module } from '@nestjs/common';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { CommerceNotificationsModule } from '../commerce-notifications/commerce-notifications.module';
import { InventoryService } from './inventory.service';
import { InventoryAdminController } from './inventory-admin.controller';
import { LowStockAlertListener } from './low-stock-alert.listener';

@Module({
  imports: [AssetUrlModule, EmailModule, SmsModule, CommerceNotificationsModule],
  controllers: [InventoryAdminController],
  providers: [InventoryService, LowStockAlertListener],
  exports: [InventoryService],
})
export class InventoryModule {}
