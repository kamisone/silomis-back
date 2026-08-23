import { Module } from '@nestjs/common';
import { UserPaymentMethodAdminController } from './user-payment-method-admin.controller';

@Module({
  controllers: [UserPaymentMethodAdminController],
})
export class PaymentMethodsModule {}
