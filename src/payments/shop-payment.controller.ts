import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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

  /**
   * Called by the success page the moment the customer is back from Stripe:
   * if the webhook has not landed yet (or never will), the order is settled
   * from Stripe's own answer. Idempotent, and it can only ever move an order
   * towards "paid" on Stripe's word — so it is safe on a public route keyed
   * by the order's id.
   */
  @Post(':orderId/reconcile')
  @HttpCode(200)
  async reconcile(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return (await this.payment.reconcileOrder(orderId)) ?? { status: null, reconciled: false };
  }
}
