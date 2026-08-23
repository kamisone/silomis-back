import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ShopEmailService } from '../email/shop-email.service';
import { COMMERCE_EVENTS, InventoryRestockedEvent } from '../commerce-events/commerce-events.constants';

/**
 * WishlistItem.userId has no backing "platform user" table in silomis (there
 * is no customer login system) — it's treated as a ShopCustomer id instead,
 * the closest equivalent that actually exists. In practice this stays a
 * no-op today since nothing currently sets userId on a wishlist row; it
 * activates automatically once silomis can identify a returning customer.
 */
@Injectable()
export class BackInStockListener {
  private readonly logger = new Logger(BackInStockListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: ShopEmailService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.INVENTORY_RESTOCKED)
  async onInventoryRestocked(event: InventoryRestockedEvent): Promise<void> {
    try {
      const product = await this.prisma.product.findUnique({ where: { id: event.productId }, select: { title: true, slug: true, status: true } });
      if (!product || product.status !== 'active') return;

      const wishlistItems = await this.prisma.wishlistItem.findMany({ where: { productId: event.productId, userId: { not: null } }, select: { userId: true } });
      const customerIds = [...new Set(wishlistItems.map((w) => w.userId).filter((id): id is string => !!id))];
      if (!customerIds.length) return;

      const customers = await this.prisma.shopCustomer.findMany({ where: { id: { in: customerIds } }, select: { email: true } });
      if (!customers.length) return;

      const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
      const productUrl = `${appUrl}/shop/${product.slug}`;

      for (const customer of customers) {
        try {
          await this.email.sendBackInStock(customer.email, { productTitle: product.title, productUrl });
        } catch (err) {
          this.logger.warn(`Back-in-stock email failed for ${customer.email}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Back-in-stock handling failed for product ${event.productId}: ${(err as Error).message}`);
    }
  }
}
