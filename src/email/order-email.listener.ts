import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ShopEmailService } from './shop-email.service';
import {
  COMMERCE_EVENTS,
  PaymentSucceededEvent,
  PaymentFailedEvent,
  OrderStatusChangedEvent,
} from '../commerce-events/commerce-events.constants';
import { OrderStatusKind } from './templates/order-status';
import { PickupPointEmailData } from './templates/pickup-point-block';
import { OrderStatus } from '../../generated/prisma/client';

const STATUS_TO_EMAIL_KIND: Partial<Record<OrderStatus, OrderStatusKind>> = {
  processing: 'preparing',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

/**
 * Narrows the stored snapshot to what an email renders. Returns null for an
 * ordinary home-delivery order, which is what keeps the block out of those
 * emails entirely.
 */
function toPickupPointEmailData(snapshot: unknown): PickupPointEmailData | null {
  const point = snapshot as Partial<PickupPointEmailData> | null;
  if (!point?.id || !point.name) return null;

  return {
    id: point.id,
    name: point.name,
    address: point.address ?? '',
    postcode: point.postcode ?? '',
    city: point.city ?? '',
    country: point.country ?? '',
    type: point.type ?? null,
    openingHours: point.openingHours ?? null,
  };
}

@Injectable()
export class OrderEmailListener {
  private readonly logger = new Logger(OrderEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: ShopEmailService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        include: { items: true },
      });
      if (!order) return;

      const trackingUrl = order.trackingToken
        ? `${process.env.APP_URL ?? ''}/shop/orders/track/${order.orderNumber}?token=${order.trackingToken}`
        : null;

      await this.email.sendOrderConfirmed(order.customerEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName ?? order.customerEmail,
        items: order.items.map((i) => ({
          title: i.titleSnapshot,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
        })),
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        discountCents: order.discountCents,
        couponCode: order.couponCode,
        totalCents: order.totalCents,
        trackingUrl,
        pickupPoint: toPickupPointEmailData(order.pickupPointSnapshot),
        locale: order.customerLocale,
      });
    } catch (err) {
      this.logger.error(
        `Order confirmation email failed for order ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(COMMERCE_EVENTS.PAYMENT_FAILED)
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
      });
      if (!order) return;

      // Prefer sending the customer straight back into their in-progress
      // checkout (cart + address still intact) over a bare shop link — the
      // session isn't marked complete on a failed payment, so its resume
      // token is still valid.
      const session = order.cartToken
        ? await this.prisma.checkoutSession.findUnique({
            where: { cartToken: order.cartToken },
          })
        : null;
      const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
      const retryUrl = session
        ? `${appUrl}/shop/checkout/resume/${session.resumeToken}`
        : `${appUrl}/shop`;

      await this.email.sendPaymentFailed(order.customerEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName ?? order.customerEmail,
        retryUrl,
        locale: order.customerLocale,
      });
    } catch (err) {
      this.logger.error(
        `Payment failed email failed for order ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(COMMERCE_EVENTS.ORDER_STATUS_CHANGED)
  async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    const kind = STATUS_TO_EMAIL_KIND[event.toStatus as OrderStatus];
    if (kind) {
      try {
        const order = await this.prisma.order.findUnique({
          where: { id: event.orderId },
        });
        if (order) {
          const trackingUrl = order.trackingToken
            ? `${process.env.APP_URL ?? ''}/shop/orders/track/${order.orderNumber}?token=${order.trackingToken}`
            : null;

          await this.email.sendOrderStatusUpdate(order.customerEmail, kind, {
            orderNumber: order.orderNumber,
            customerName: order.customerName ?? order.customerEmail,
            trackingUrl,
            pickupPoint: toPickupPointEmailData(order.pickupPointSnapshot),
            locale: order.customerLocale,
          });
        }
      } catch (err) {
        this.logger.error(
          `Order ${kind} email failed for order ${event.orderId}: ${(err as Error).message}`,
        );
      }
    }

    if (event.toStatus === 'delivered') {
      await this.sendReviewRequest(event.orderId);
    }
  }

  private async sendReviewRequest(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) return;

      // Send one review request for the first item still tied to a live product
      // (avoids email flooding on multi-item orders, mirrors vitecamio behaviour).
      const first = order.items.find((i) => i.productId);
      if (!first?.productId) return;

      const product = await this.prisma.product.findUnique({
        where: { id: first.productId },
        select: { slug: true },
      });
      if (!product) return;

      const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
      await this.email.sendReviewRequest(order.customerEmail, {
        customerName: order.customerName ?? order.customerEmail,
        orderNumber: order.orderNumber,
        productTitle: first.titleSnapshot,
        reviewUrl: `${appUrl}/shop/${product.slug}`,
        locale: order.customerLocale,
      });
    } catch (err) {
      this.logger.error(
        `Review request email failed for order ${orderId}: ${(err as Error).message}`,
      );
    }
  }
}
