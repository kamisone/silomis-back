import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersModule } from '../orders/orders.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersModule } from '../customers/customers.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { DlqModule } from '../dlq/dlq.module';
import { CHECKOUT_RESERVATION_QUEUE } from './checkout-reservation.constants';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutSessionService } from './checkout-session.service';
import { CheckoutSessionCleanupService } from './checkout-session-cleanup.service';
import { CheckoutReservationProcessor } from './checkout-reservation.processor';

@Module({
  imports: [OrdersModule, InventoryModule, CustomersModule, ShippingModule, PromotionsModule, DlqModule, BullModule.registerQueue({ name: CHECKOUT_RESERVATION_QUEUE })],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutSessionService, CheckoutSessionCleanupService, CheckoutReservationProcessor],
  exports: [CheckoutService, CheckoutSessionService],
})
export class CheckoutModule {}
