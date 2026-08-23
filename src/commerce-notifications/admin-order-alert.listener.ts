import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceNotificationService } from './commerce-notification.service';
import { COMMERCE_EVENTS, PaymentSucceededEvent, PaymentFailedEvent, OrderStatusChangedEvent } from '../commerce-events/commerce-events.constants';

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

@Injectable()
export class AdminOrderAlertListener {
  private readonly logger = new Logger(AdminOrderAlertListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: CommerceNotificationService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({ where: { id: event.orderId }, select: { orderNumber: true, customerEmail: true } });
      if (!order) return;
      await this.notifications.notify({
        event: 'payment_succeeded',
        orderId: event.orderId,
        orderNumber: order.orderNumber,
        summary: `Order ${order.orderNumber} paid by ${order.customerEmail} — ${fmtCents(event.amountCents)}`,
        detailUrl: this.detailUrl(event.orderId),
      });
    } catch (err) {
      this.logger.warn(`Admin alert failed for payment_succeeded on order ${event.orderId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(COMMERCE_EVENTS.PAYMENT_FAILED)
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({ where: { id: event.orderId }, select: { orderNumber: true, customerEmail: true } });
      if (!order) return;
      await this.notifications.notify({
        event: 'payment_failed',
        orderId: event.orderId,
        orderNumber: order.orderNumber,
        summary: `Payment failed for order ${order.orderNumber} (${order.customerEmail})`,
        detailUrl: this.detailUrl(event.orderId),
      });
    } catch (err) {
      this.logger.warn(`Admin alert failed for payment_failed on order ${event.orderId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(COMMERCE_EVENTS.ORDER_STATUS_CHANGED)
  async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (event.toStatus !== 'cancelled') return;
    try {
      const order = await this.prisma.order.findUnique({ where: { id: event.orderId }, select: { orderNumber: true, customerEmail: true } });
      if (!order) return;
      await this.notifications.notify({
        event: 'order_cancelled',
        orderId: event.orderId,
        orderNumber: order.orderNumber,
        summary: `Order ${order.orderNumber} (${order.customerEmail}) was cancelled`,
        detailUrl: this.detailUrl(event.orderId),
      });
    } catch (err) {
      this.logger.warn(`Admin alert failed for order_cancelled on order ${event.orderId}: ${(err as Error).message}`);
    }
  }

  private detailUrl(orderId: string): string | null {
    const appUrl = process.env.APP_URL;
    return appUrl ? `${appUrl.replace(/\/$/, '')}/admin/shop/orders/${orderId}` : null;
  }
}
