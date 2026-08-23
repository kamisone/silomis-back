import { Module } from '@nestjs/common';
import { EmailTransportService } from './email-transport.service';
import { ShopEmailService } from './shop-email.service';
import { OrderEmailListener } from './order-email.listener';

@Module({
  providers: [EmailTransportService, ShopEmailService, OrderEmailListener],
  exports: [ShopEmailService, EmailTransportService],
})
export class EmailModule {}
