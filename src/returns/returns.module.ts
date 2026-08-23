import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReturnsService } from './returns.service';
import { ReturnsAdminController } from './returns-admin.controller';

@Module({
  imports: [InventoryModule, OrdersModule, PaymentsModule],
  providers: [ReturnsService],
  controllers: [ReturnsAdminController],
  exports: [ReturnsService],
})
export class ReturnsModule {}
