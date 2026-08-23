import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ShopPaymentService } from './shop-payment.service';

@Public()
@Controller('shop/payment')
export class ShopPaymentController {
  constructor(private readonly payment: ShopPaymentService) {}

  @Post('intent')
  createIntent(@Body('orderId') orderId: string) {
    return this.payment.createPaymentIntent(orderId);
  }
}
