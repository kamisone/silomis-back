import { Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { CustomerSmsService } from './customer-sms.service';
import { CustomerSmsListener } from './customer-sms.listener';

@Module({
  controllers: [SmsController],
  providers: [SmsService, CustomerSmsService, CustomerSmsListener],
  exports: [SmsService, CustomerSmsService],
})
export class SmsModule {}
