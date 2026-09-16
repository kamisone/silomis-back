import { Module } from '@nestjs/common';
import { PaymentReconcileService } from './payment-reconcile.service';
import { CommerceNotificationsModule } from '../commerce-notifications/commerce-notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { MetaCapiModule } from '../marketing/meta-capi/meta-capi.module';
import { TikTokEventsModule } from '../marketing/tiktok-events/tiktok-events.module';
import { stripeProvider } from './stripe.provider';
import { ShopPaymentService } from './shop-payment.service';
import { ShopPaymentController } from './shop-payment.controller';
import { PaymentTransactionAdminController } from './payment-transaction-admin.controller';
import { PaymentTypeAdminController } from './payment-type-admin.controller';

@Module({
  imports: [OrdersModule, MetaCapiModule, TikTokEventsModule, CommerceNotificationsModule],
  controllers: [ShopPaymentController, PaymentTransactionAdminController, PaymentTypeAdminController],
  providers: [stripeProvider, ShopPaymentService, PaymentReconcileService],
  exports: [stripeProvider, ShopPaymentService],
})
export class PaymentsModule {}
