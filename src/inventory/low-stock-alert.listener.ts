import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ShopEmailService } from '../email/shop-email.service';
import { SmsService } from '../sms/sms.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { COMMERCE_EVENTS, InventoryLowStockEvent } from '../commerce-events/commerce-events.constants';

@Injectable()
export class LowStockAlertListener {
  private readonly logger = new Logger(LowStockAlertListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly email: ShopEmailService,
    private readonly sms: SmsService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.INVENTORY_LOW_STOCK)
  async onInventoryLowStock(event: InventoryLowStockEvent): Promise<void> {
    try {
      if (!this.platformSettings.isLowStockAlertsEnabled()) return;

      const variant = await this.prisma.productVariant.findUnique({
        where: { id: event.variantId },
        select: { title: true, product: { select: { title: true } } },
      });
      if (!variant) return;

      const admins = await this.prisma.admin.findMany({ select: { email: true, phone: true } });
      if (!admins.length) return;

      const emailData = {
        productTitle: variant.product.title,
        variantTitle: variant.title,
        available: event.available,
        lowStockThreshold: event.lowStockThreshold,
      };
      const smsMessage = `[Silomis] Low stock: ${variant.product.title} (${variant.title}) — ${event.available} left (threshold ${event.lowStockThreshold})`;

      let sent = 0;
      for (const admin of admins) {
        try {
          await this.email.sendLowStockAlert(admin.email, emailData);
          sent++;
        } catch (err) {
          this.logger.warn(`Low stock email failed for ${admin.email}: ${(err as Error).message}`);
        }
        if (admin.phone) {
          try {
            await this.sms.addMessage(admin.phone, smsMessage);
          } catch (err) {
            this.logger.warn(`Low stock SMS failed for ${admin.phone}: ${(err as Error).message}`);
          }
        }
      }

      this.logger.log(`Low stock alert sent to ${sent} admin(s) for variant ${event.variantId} (${event.available} available)`);
    } catch (err) {
      this.logger.warn(`Low stock alert handling failed for variant ${event.variantId}: ${(err as Error).message}`);
    }
  }
}
