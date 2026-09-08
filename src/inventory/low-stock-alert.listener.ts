import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ShopEmailService } from '../email/shop-email.service';
import { SmsService } from '../sms/sms.service';
import { CommerceNotificationService } from '../commerce-notifications/commerce-notification.service';
import { COMMERCE_EVENTS, InventoryLowStockEvent } from '../commerce-events/commerce-events.constants';

@Injectable()
export class LowStockAlertListener {
  private readonly logger = new Logger(LowStockAlertListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: CommerceNotificationService,
    private readonly email: ShopEmailService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Shares the admin-notification gate, recipient lists and send log with the
   * order alerts, but keeps its own email template — the low-stock mail names
   * the product, the variant and the threshold, which the generic order-alert
   * layout cannot express. Hence resolveRecipients() + logDelivery() rather
   * than notify().
   *
   * The switch is the "Low Stock Alert" event on Shop → Settings →
   * Notifications. It used to be `low_stock_alerts_enabled` in platform
   * settings, which defaulted to off and had no page anywhere in the admin UI,
   * so the alerts could never actually be turned on.
   */
  @OnEvent(COMMERCE_EVENTS.INVENTORY_LOW_STOCK)
  async onInventoryLowStock(event: InventoryLowStockEvent): Promise<void> {
    try {
      const recipients = await this.notifications.resolveRecipients('low_stock');
      if (!recipients) return;

      const variant = await this.prisma.productVariant.findUnique({
        where: { id: event.variantId },
        select: { title: true, product: { select: { title: true } } },
      });
      if (!variant) return;

      const emailData = {
        productTitle: variant.product.title,
        variantTitle: variant.title,
        available: event.available,
        lowStockThreshold: event.lowStockThreshold,
      };
      const seller = process.env.SELLER_NAME ?? 'Silomis';
      const smsMessage = `[${seller}] Low stock: ${variant.product.title} (${variant.title}) — ${event.available} left (threshold ${event.lowStockThreshold})`;

      for (const address of recipients.emails) {
        try {
          await this.email.sendLowStockAlert(address, emailData);
          await this.notifications.logDelivery('low_stock', 'email', address, 'sent');
        } catch (err) {
          this.logger.warn(`Low stock email failed for ${address}: ${(err as Error).message}`);
          await this.notifications.logDelivery('low_stock', 'email', address, 'failed', (err as Error).message);
        }
      }

      for (const phone of recipients.phones) {
        try {
          await this.sms.addMessage(phone, smsMessage);
          await this.notifications.logDelivery('low_stock', 'sms', phone, 'sent');
        } catch (err) {
          this.logger.warn(`Low stock SMS failed for ${phone}: ${(err as Error).message}`);
          await this.notifications.logDelivery('low_stock', 'sms', phone, 'failed', (err as Error).message);
        }
      }

      this.logger.log(`Low stock alert sent for variant ${event.variantId} (${event.available} available)`);
    } catch (err) {
      this.logger.warn(`Low stock alert handling failed for variant ${event.variantId}: ${(err as Error).message}`);
    }
  }
}
