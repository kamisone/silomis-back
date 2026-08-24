import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';
import { CheckoutSessionService } from '../checkout/checkout-session.service';
import {
  COMMERCE_EVENTS,
  PaymentSucceededEvent,
} from '../commerce-events/commerce-events.constants';

/**
 * Reacts to a successful payment by closing out everything tied to the cart
 * token the order came from — the cart itself (which also cancels its
 * pending abandonment-reminder job) and the checkout session (so its resume
 * link stops working once the order is actually paid).
 */
@Injectable()
export class CartCheckoutCompletionListener {
  private readonly logger = new Logger(CartCheckoutCompletionListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly checkoutSession: CheckoutSessionService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        select: { cartToken: true },
      });
      if (!order?.cartToken) return;

      await this.cart.markCompleted(order.cartToken);
      await this.checkoutSession.markComplete(order.cartToken);
    } catch (err) {
      this.logger.error(
        `Checkout completion cleanup failed for order ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }
}
