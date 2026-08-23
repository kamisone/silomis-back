import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { testCheckoutBlockedException } from '../common/utils/test-product.util';
import { BehaviorTrackingService } from '../analytics-tracking/behavior-tracking.service';
import { Order } from '../../generated/prisma/client';

/**
 * Refuses checkout for orders containing a test product.
 *
 * Called from `CheckoutService.readyForPayment` — the transition triggered
 * when the customer confirms shipping and clicks through to payment. Blocking
 * there means the refusal lands before the draft → awaiting_payment
 * transition and before any Stripe call: no PaymentIntent is ever created for
 * a test product, so no charge is possible by construction rather than by guard.
 */
@Injectable()
export class TestCheckoutGuard {
  private readonly logger = new Logger(TestCheckoutGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: BehaviorTrackingService,
  ) {}

  /** @throws BadRequestException with a generic failure message when the order contains a test product. */
  async assertCheckoutAllowed(order: Order | string): Promise<void> {
    const resolved = typeof order === 'string' ? await this.prisma.order.findUnique({ where: { id: order } }) : order;
    if (!resolved) throw new NotFoundException('Order not found');

    // Live product state is the authority, not order.isTestOrder — a product
    // flagged while this customer was mid-checkout must still be caught.
    const testProductIds = await this.findTestProductIds(resolved.id);
    if (!testProductIds.length) return;

    if (!resolved.isTestOrder) {
      await this.prisma.order.update({ where: { id: resolved.id }, data: { isTestOrder: true } });
    }

    this.logger.log(`Blocked checkout on test order ${resolved.orderNumber} (${resolved.totalCents} cents) — no PaymentIntent created`);
    await this.tracking.record({ eventType: 'test_checkout_blocked', cartToken: resolved.cartToken, productId: testProductIds[0] });
    throw testCheckoutBlockedException(resolved.customerLocale);
  }

  private async findTestProductIds(orderId: string): Promise<string[]> {
    const items = await this.prisma.orderItem.findMany({ where: { orderId }, select: { productId: true }, distinct: ['productId'] });
    const productIds = items.map((i) => i.productId).filter((id): id is string => !!id);
    if (!productIds.length) return [];

    const testProducts = await this.prisma.product.findMany({ where: { id: { in: productIds }, isTestProduct: true }, select: { id: true } });
    return testProducts.map((p) => p.id);
  }
}
