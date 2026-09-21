import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { DlqModule } from '../dlq/dlq.module';
import { GcsModule } from '../gcs/gcs.module';
import { OrdersModule } from '../orders/orders.module';
import { CommerceNotificationsModule } from '../commerce-notifications/commerce-notifications.module';
import { SupportConversationsService } from './support-conversations.service';
import { SupportAttachmentsService } from './support-attachments.service';
import { SupportNotificationService } from './support-notification.service';
import { SupportLifecycleService } from './support-lifecycle.service';
import { SupportGateway } from './support.gateway';
import { SupportGuestController } from './support-guest.controller';
import { SupportOrderController } from './support-order.controller';
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
    // For chat image storage; AssetUrlModule is global.
    GcsModule,
    // For OrderAccessService: order threads authenticate on an order grant.
    OrdersModule,
  ],
  controllers: [
    SupportGuestController,
    SupportOrderController,
    SupportAdminController,
  ],
  providers: [
    SupportConversationsService,
    SupportAttachmentsService,
    SupportNotificationService,
    SupportLifecycleService,
    SupportGateway,
    SupportNotificationProcessor,
  ],
  exports: [SupportConversationsService],
})
export class SupportModule {}
