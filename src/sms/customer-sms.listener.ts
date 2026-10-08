import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerSmsService } from './customer-sms.service';
import { CustomerSmsKind } from './customer-sms-copy';
import {
  COMMERCE_EVENTS,
  OrderStatusChangedEvent,
  PaymentFailedEvent,
  PaymentSucceededEvent,
  SendInStatusChangedEvent,
} from '../commerce-events/commerce-events.constants';

/**
 * Order statuses worth a text. "Preparing" and "delivered" are left to email
 * and the tracking page: the first is news the customer can wait for, the
 * second is news they already have — the parcel is in their hands.
 */
const STATUS_SMS: Partial<Record<string, CustomerSmsKind>> = {
  shipped: 'order_shipped',
  cancelled: 'order_cancelled',
};

/**
 * Send-in steps worth a text: the item arrived, it is on its way back, and
 * the one where the shop needs the customer. Being in production is shown on
 * the tracking page.
 */
const SEND_IN_SMS: Partial<Record<string, CustomerSmsKind>> = {
  received: 'send_in_received',
  returned: 'send_in_returned',
  problem: 'send_in_problem',
};

/**
 * A customer retrying a declined card three times in a minute is one problem,
 * not three — and they are still on the checkout page. One text per order per
 * window.
 */
const PAYMENT_FAILED_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * The SMS twin of OrderEmailListener and SendInEmailListener, listening to the
 * same events. Kept separate rather than folded into them so that a failing
 * SMTP (which is the common case in dev) never stops the text going out, and
 * the other way round.
 */
@Injectable()
export class CustomerSmsListener {
  private readonly logger = new Logger(CustomerSmsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: CustomerSmsService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    const order = await this.findOrder(event.orderId);
    if (order) await this.sms.send('order_confirmed', order, this.sms.trackingUrl(order));
  }

  @OnEvent(COMMERCE_EVENTS.PAYMENT_FAILED)
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    try {
      const order = await this.findOrder(event.orderId);
      if (!order?.customerPhone) return;

      const recent = await this.prisma.commerceNotificationLog.findFirst({
        where: {
          orderId: order.id,
          event: 'customer_payment_failed',
          status: 'sent',
          createdAt: { gte: new Date(Date.now() - PAYMENT_FAILED_COOLDOWN_MS) },
        },
        select: { id: true },
      });
      if (recent) return;

      // Same destination as the payment-failed email: back into the checkout
      // with the cart and address intact, while the session is still open.
      const session = order.cartToken
        ? await this.prisma.checkoutSession.findUnique({ where: { cartToken: order.cartToken } })
        : null;
      const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
      const retryUrl = session ? `${appUrl}/shop/checkout/resume/${session.resumeToken}` : `${appUrl}/shop`;

      await this.sms.send('payment_failed', order, retryUrl);
    } catch (err) {
      this.logger.error(`Payment-failed SMS for ${event.orderId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(COMMERCE_EVENTS.ORDER_STATUS_CHANGED)
  async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (event.silent) return;
    const kind = STATUS_SMS[event.toStatus];
    if (!kind) return;
    const order = await this.findOrder(event.orderId);
    if (order) await this.sms.send(kind, order, this.sms.trackingUrl(order));
  }

  @OnEvent(COMMERCE_EVENTS.SEND_IN_STATUS_CHANGED)
  async onSendInStatusChanged(event: SendInStatusChangedEvent): Promise<void> {
    if (event.fromStatus === event.toStatus) return;
    const kind = SEND_IN_SMS[event.toStatus];
    if (!kind) return;
    const order = await this.findOrder(event.orderId);
    if (order) await this.sms.send(kind, order, this.sms.trackingUrl(order));
  }

  private async findOrder(orderId: string) {
    try {
      return await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, customerPhone: true, customerLocale: true, trackingToken: true, cartToken: true },
      });
    } catch (err) {
      this.logger.error(`Customer SMS could not load order ${orderId}: ${(err as Error).message}`);
      return null;
    }
  }
}
