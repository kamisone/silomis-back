import { Module } from '@nestjs/common';
import { EmailTransportService } from './email-transport.service';
import { ShopEmailService } from './shop-email.service';
import { OrderEmailListener } from './order-email.listener';
import { SendInEmailListener } from './send-in-email.listener';

@Module({
  providers: [EmailTransportService, ShopEmailService, OrderEmailListener, SendInEmailListener],
  exports: [ShopEmailService, EmailTransportService],
})
export class EmailModule {}
