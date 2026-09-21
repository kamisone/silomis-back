import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { TranslationsModule } from '../translations/translations.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersModule } from '../customers/customers.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AnalyticsTrackingModule } from '../analytics-tracking/analytics-tracking.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { SendInModule } from '../send-in/send-in.module';
import { CHECKOUT_RESERVATION_QUEUE } from '../checkout/checkout-reservation.constants';
import { EmailModule } from '../email/email.module';
import { OrdersService } from './orders.service';
import { OrderAccessService } from './order-access.service';
import { orderGrantSecret } from './order-access.constants';
import { OrdersAdminController } from './orders-admin.controller';
import { OrdersPublicController } from './orders-public.controller';
import { OrderStatusRefAdminController } from './order-status-ref-admin.controller';
import { TestCheckoutGuard } from './test-checkout-guard.service';

@Module({
  imports: [
    TranslationsModule,
    InventoryModule,
    CustomersModule,
    ShippingModule,
    AnalyticsTrackingModule,
    PersonalizationModule,
    SendInModule,
    EmailModule,
    BullModule.registerQueue({ name: CHECKOUT_RESERVATION_QUEUE }),
    // Module-scoped on purpose: this registration signs with a key derived
    // from JWT_SECRET rather than JWT_SECRET itself, so an order grant can
    // never be replayed as an admin session. See order-access.constants.ts.
    JwtModule.registerAsync({
      useFactory: () => ({ secret: orderGrantSecret() }),
    }),
  ],
  controllers: [
    OrdersAdminController,
    OrdersPublicController,
    OrderStatusRefAdminController,
  ],
  providers: [OrdersService, OrderAccessService, TestCheckoutGuard],
  exports: [OrdersService, OrderAccessService, TestCheckoutGuard],
})
export class OrdersModule {}
