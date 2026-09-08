import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { DlqModule } from '../dlq/dlq.module';
import { CommerceNotificationsModule } from '../commerce-notifications/commerce-notifications.module';
import { SupportConversationsService } from './support-conversations.service';
import { SupportNotificationService } from './support-notification.service';
import { SupportLifecycleService } from './support-lifecycle.service';
import { SupportGateway } from './support.gateway';
import { SupportGuestController } from './support-guest.controller';
import { SupportAdminController } from './support-admin.controller';
import { SupportNotificationProcessor } from './support-notification.processor';
import { SUPPORT_QUEUE } from './support.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: SUPPORT_QUEUE }),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret)
          throw new Error('JWT_SECRET env var is required for SupportModule');
        return { secret };
      },
    }),
    DlqModule,
    CommerceNotificationsModule,
  ],
  controllers: [SupportGuestController, SupportAdminController],
  providers: [
    SupportConversationsService,
    SupportNotificationService,
    SupportLifecycleService,
    SupportGateway,
    SupportNotificationProcessor,
  ],
  exports: [SupportConversationsService],
})
export class SupportModule {}
