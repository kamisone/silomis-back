import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COMMERCE_EVENTS,
  OrderCreatedEvent,
  PaymentSucceededEvent,
} from '../../commerce-events/commerce-events.constants';
import { TikTokEventsService } from './tiktok-events.service';

/**
 * TikTok Events API — reacts to the same domain events MetaCapiOrderListener
 * does (a separate, independent listener — commerce events are meant to be
 * fanned out to, modules must not call each other directly).
 * ORDER_CREATED → InitiateCheckout, PAYMENT_SUCCEEDED → Purchase.
 */
@Injectable()
export class TikTokEventsOrderListener {
  private readonly logger = new Logger(TikTokEventsOrderListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokEvents: TikTokEventsService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.ORDER_CREATED)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        include: { items: true },
      });
      if (!order) return;

      await this.tiktokEvents.sendEvent({
        eventName: 'InitiateCheckout',
        // Same value the browser-side InitiateCheckout event uses as its
        // event ID — matches TikTok's dedup on (event, event_id).
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout`,
        properties: {
          contents: order.items.map((i) => ({
            content_id: i.variantId ?? i.productId ?? i.id,
            content_type: 'product',
            content_name: i.titleSnapshot,
            quantity: i.quantity,
            price: i.unitPriceCents / 100,
          })),
          value: order.totalCents / 100,
          currency: 'EUR',
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        ttclid: order.tiktokClickId,
        ttp: order.tiktokBrowserId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send TikTok InitiateCheckout event for ${event.orderId}: ${(err as Error).message}`,
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

      await this.tiktokEvents.sendEvent({
        eventName: 'Purchase',
        // Same value the browser-side Purchase event uses as its event ID.
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout/success?order=${order.orderNumber}`,
        properties: {
          contents: order.items.map((i) => ({
            content_id: i.variantId ?? i.productId ?? i.id,
            content_type: 'product',
            content_name: i.titleSnapshot,
            quantity: i.quantity,
            price: i.unitPriceCents / 100,
          })),
          value: order.totalCents / 100,
          currency: 'EUR',
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        ttclid: order.tiktokClickId,
        ttp: order.tiktokBrowserId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send TikTok Purchase event for ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }
}
