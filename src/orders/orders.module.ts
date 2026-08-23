import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TranslationsModule } from '../translations/translations.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersModule } from '../customers/customers.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AnalyticsTrackingModule } from '../analytics-tracking/analytics-tracking.module';
import { CHECKOUT_RESERVATION_QUEUE } from '../checkout/checkout-reservation.constants';
import { OrdersService } from './orders.service';
import { OrdersAdminController } from './orders-admin.controller';
import { OrdersPublicController } from './orders-public.controller';
import { OrderStatusRefAdminController } from './order-status-ref-admin.controller';
import { TestCheckoutGuard } from './test-checkout-guard.service';

@Module({
  imports: [TranslationsModule, InventoryModule, CustomersModule, ShippingModule, AnalyticsTrackingModule, BullModule.registerQueue({ name: CHECKOUT_RESERVATION_QUEUE })],
  controllers: [OrdersAdminController, OrdersPublicController, OrderStatusRefAdminController],
  providers: [OrdersService, TestCheckoutGuard],
  exports: [OrdersService, TestCheckoutGuard],
})
export class OrdersModule {}
