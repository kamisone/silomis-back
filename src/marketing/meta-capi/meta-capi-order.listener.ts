import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COMMERCE_EVENTS,
  OrderCreatedEvent,
  PaymentSucceededEvent,
} from '../../commerce-events/commerce-events.constants';
import { MetaCapiService } from './meta-capi.service';

/**
 * Meta Conversions API — reacts to the same domain events OrderEmailListener
 * and CheckoutStartedListener already consume (a separate, independent
 * listener — commerce events are meant to be fanned out to, modules must not
 * call each other directly). ORDER_CREATED → InitiateCheckout,
 * PAYMENT_SUCCEEDED → Purchase.
 */
@Injectable()
export class MetaCapiOrderListener {
  private readonly logger = new Logger(MetaCapiOrderListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaCapi: MetaCapiService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.ORDER_CREATED)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        include: { items: true },
      });
      if (!order) return;

      await this.metaCapi.sendEvent({
        eventName: 'InitiateCheckout',
        // Same value the browser-side InitiateCheckout event uses as its
        // eventID — matches Meta's dedup on (event_name, event_id).
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout`,
        customData: {
          value: order.totalCents / 100,
          currency: 'EUR',
          content_type: 'product',
          content_ids: order.items.map(
            (i) => i.variantId ?? i.productId ?? i.id,
          ),
          num_items: order.items.reduce((n, i) => n + i.quantity, 0),
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        fbc: order.metaClickId,
        fbp: order.metaBrowserId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send Meta CAPI InitiateCheckout event for ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        include: { items: true },
      });
      if (!order || !order.customerEmail || !order.items.length) return;

      await this.metaCapi.sendEvent({
        eventName: 'Purchase',
        // Same value the browser-side Purchase event uses as its eventID.
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout/success?order=${order.orderNumber}`,
        customData: {
          value: order.totalCents / 100,
          currency: 'EUR',
          content_type: 'product',
          content_ids: order.items.map(
            (i) => i.variantId ?? i.productId ?? i.id,
          ),
          contents: order.items.map((i) => ({
            id: i.variantId ?? i.productId ?? i.id,
            quantity: i.quantity,
            item_price: i.unitPriceCents / 100,
          })),
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        fbc: order.metaClickId,
        fbp: order.metaBrowserId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send Meta CAPI purchase event for ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }
}
