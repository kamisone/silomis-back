import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, RawBodyRequest, Req, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ShopPaymentService } from '../payments/shop-payment.service';

/**
 * Stripe dashboard endpoint: POST /webhooks/stripe/shop
 * Signing secret: STRIPE_SHOP_WEBHOOK_SECRET
 *
 * Contract: always return HTTP 200 after successful signature verification so
 * Stripe does not retry. Invalid signatures get 400 (Stripe stops retrying those).
 */
@Public()
@Controller('webhooks/stripe')
export class StripeWebhooksController {
  private readonly logger = new Logger(StripeWebhooksController.name);

  constructor(private readonly shopPayment: ShopPaymentService) {}

  @Post('shop')
  @HttpCode(200)
  async handleShopWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string, @Res() res: Response) {
    this.logger.log(`Stripe shop webhook — rawBody=${req.rawBody?.length ?? 0}B`);

    if (!process.env.STRIPE_SHOP_WEBHOOK_SECRET) {
      this.logger.error('STRIPE_SHOP_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    try {
      await this.shopPayment.processWebhook(req.rawBody!, sig);
    } catch (err) {
      if (err instanceof BadRequestException) {
        this.logger.warn(`Shop webhook signature rejected — verify STRIPE_SHOP_WEBHOOK_SECRET: ${(err as Error).message}`);
        return res.status(400).json({ error: (err as BadRequestException).message });
      }
      this.logger.error('Shop webhook unexpected error', (err as Error).stack);
    }

    return res.status(200).json({ received: true });
  }
}
