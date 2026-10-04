import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { deviceFromUserAgent } from '../common/utils/device.util';
import { BehaviorTrackingService } from './behavior-tracking.service';
import {
  CheckoutPaymentStepReachedEvent,
  COMMERCE_EVENTS,
  OrderCreatedEvent,
} from '../commerce-events/commerce-events.constants';

@Injectable()
export class CheckoutStartedListener {
  private readonly logger = new Logger(CheckoutStartedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: BehaviorTrackingService,
  ) {}

  /**
   * ORDER_CREATED fires when the customer submits the address form, which is
   * exactly the moment they land on the shipping step — one step before they
   * click through to payment.
   *
   * Written once per distinct product in the order, not once per order: the
   * product-scoped funnel and the test-product demand report both group by
   * `productId`, so a single cart-level row with a NULL productId is invisible
   * to them and their "reached shipping" column can only ever read 0.
   *
   * The extra rows do not inflate anything. Every report counts
   * DISTINCT COALESCE(visitorHash, cartToken, id) rather than rows, and each
   * row of one order carries the same visitor key.
   */
  @OnEvent(COMMERCE_EVENTS.ORDER_CREATED)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.recordPerProduct(event.orderId, 'checkout_started');
  }

  /**
   * The draft passed every gate and moved to awaiting_payment — the live
   * product's "reached checkout". Test orders never get here (TestCheckoutGuard
   * throws first and writes test_checkout_blocked), so the two events never
   * both describe the same order.
   */
  @OnEvent(COMMERCE_EVENTS.CHECKOUT_PAYMENT_STEP_REACHED)
  async onPaymentStepReached(event: CheckoutPaymentStepReachedEvent): Promise<void> {
    await this.recordPerProduct(event.orderId, 'payment_step_reached');
  }

  private async recordPerProduct(
    orderId: string,
    eventType: 'checkout_started' | 'payment_step_reached',
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { cartToken: true, customerId: true, clientIpAddress: true, clientUserAgent: true },
    });
    if (!order) return;

    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true },
      distinct: ['productId'],
    });
    const productIds = items.map((i) => i.productId).filter((id): id is string => !!id);

    // No request is in scope here — the listener runs off an event — but
    // checkout captured the client IP on the order, so the step can still be
    // geolocated. record() derives countryCode and visitorHash from it, which
    // is what makes this step visible in the country breakdowns at all.
    //
    // userAgent is deliberately not passed: that argument triggers the bot
    // check, which belongs on request-scoped call sites. This one is
    // server-authoritative — the customer already submitted an address form.
    const base = {
      eventType,
      cartToken: order.cartToken,
      shopCustomerId: order.customerId,
      clientIp: order.clientIpAddress,
      device: deviceFromUserAgent(order.clientUserAgent),
    };

    try {
      if (!productIds.length) {
        await this.tracking.record(base);
        return;
      }
      for (const productId of productIds) {
        await this.tracking.record({ ...base, productId });
      }
    } catch (err) {
      this.logger.warn(`Failed to record ${eventType} for order ${orderId}: ${(err as Error).message}`);
    }
  }
}
