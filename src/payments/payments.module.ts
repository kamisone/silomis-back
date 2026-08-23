import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { stripeProvider } from './stripe.provider';
import { ShopPaymentService } from './shop-payment.service';
import { ShopPaymentController } from './shop-payment.controller';
import { PaymentTransactionAdminController } from './payment-transaction-admin.controller';
import { PaymentTypeAdminController } from './payment-type-admin.controller';

@Module({
  imports: [OrdersModule],
  controllers: [ShopPaymentController, PaymentTransactionAdminController, PaymentTypeAdminController],
  providers: [stripeProvider, ShopPaymentService],
  exports: [stripeProvider, ShopPaymentService],
})
export class PaymentsModule {}
