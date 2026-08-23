import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { CommerceNotificationService } from './commerce-notification.service';
import { CommerceNotificationAdminController } from './commerce-notification-admin.controller';
import { AdminOrderAlertListener } from './admin-order-alert.listener';

@Module({
  imports: [EmailModule, SmsModule],
  providers: [CommerceNotificationService, AdminOrderAlertListener],
  controllers: [CommerceNotificationAdminController],
  exports: [CommerceNotificationService],
})
export class CommerceNotificationsModule {}
