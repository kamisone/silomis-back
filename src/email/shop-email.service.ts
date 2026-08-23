import { Injectable, Logger } from '@nestjs/common';
import { EmailTransportService } from './email-transport.service';
import {
  renderOrderConfirmed,
  OrderConfirmedEmailData,
} from './templates/order-confirmed';
import {
  renderAbandonedCart,
  AbandonedCartEmailData,
} from './templates/abandoned-cart';
import {
  renderLowStockAlert,
  LowStockAlertEmailData,
} from './templates/low-stock-alert';
import {
  renderOrderStatus,
  OrderStatusEmailData,
  OrderStatusKind,
} from './templates/order-status';
import {
  renderBackInStock,
  BackInStockEmailData,
} from './templates/back-in-stock';
import {
  renderAdminOrderAlert,
  AdminOrderAlertEmailData,
} from './templates/admin-order-alert';
import {
  renderReviewRequest,
  ReviewRequestEmailData,
} from './templates/review-request';

@Injectable()
export class ShopEmailService {
  private readonly logger = new Logger(ShopEmailService.name);

  constructor(private readonly transport: EmailTransportService) {}

  async sendOrderConfirmed(
    to: string,
    data: OrderConfirmedEmailData,
  ): Promise<void> {
    const { subject, html } = renderOrderConfirmed(data);
    await this.transport.send(to, subject, html);
    this.logger.log(
      `Order confirmed email sent to ${to} for ${data.orderNumber}`,
    );
  }

  async sendAbandonedCart(
    to: string,
    data: AbandonedCartEmailData,
  ): Promise<void> {
    const { subject, html } = renderAbandonedCart(data);
    await this.transport.send(to, subject, html);
    this.logger.log(`Abandoned cart email sent to ${to}`);
  }

  async sendLowStockAlert(
    to: string,
    data: LowStockAlertEmailData,
  ): Promise<void> {
    const { subject, html } = renderLowStockAlert(data);
    await this.transport.send(to, subject, html);
    this.logger.log(
      `Low stock alert email sent to ${to} for ${data.productTitle}`,
    );
  }

  async sendOrderStatusUpdate(
    to: string,
    kind: OrderStatusKind,
    data: OrderStatusEmailData,
  ): Promise<void> {
    const { subject, html } = renderOrderStatus(kind, data);
    await this.transport.send(to, subject, html);
    this.logger.log(
      `Order ${kind} email sent to ${to} for ${data.orderNumber}`,
    );
  }

  async sendBackInStock(to: string, data: BackInStockEmailData): Promise<void> {
    const { subject, html } = renderBackInStock(data);
    await this.transport.send(to, subject, html);
    this.logger.log(
      `Back-in-stock email sent to ${to} for ${data.productTitle}`,
    );
  }

  async sendAdminOrderAlert(
    to: string,
    event: string,
    data: AdminOrderAlertEmailData,
  ): Promise<void> {
    const { subject, html } = renderAdminOrderAlert(event, data);
    await this.transport.send(to, subject, html);
    this.logger.log(`Admin alert "${event}" sent to ${to}`);
  }

  async sendReviewRequest(
    to: string,
    data: ReviewRequestEmailData,
  ): Promise<void> {
    const { subject, html } = renderReviewRequest(data);
    await this.transport.send(to, subject, html);
    this.logger.log(
      `Review request email sent to ${to} for ${data.orderNumber}`,
    );
  }
}
