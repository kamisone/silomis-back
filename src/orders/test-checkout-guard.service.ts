import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { testCheckoutBlockedException } from '../common/utils/test-product.util';
import { deviceFromUserAgent } from '../common/utils/device.util';
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
    await this.recordDemandSignal(resolved, testProductIds);
    throw testCheckoutBlockedException(resolved.customerLocale);
  }

  /**
   * One event per distinct test product, so demand is attributed to each of
   * them — recording only testProductIds[0] left every other test product in
   * the same order reading 0 on the demand report.
   *
   * The client context comes off the order because no request is in scope
   * here: record() turns clientIp into countryCode and visitorHash, without
   * which this step is missing from every country breakdown.
   *
   * Never let an analytics failure change the block outcome — the throw below
   * is the point of this method's caller.
   */
  private async recordDemandSignal(order: Order, productIds: string[]): Promise<void> {
    try {
      const base = {
        eventType: 'test_checkout_blocked' as const,
        cartToken: order.cartToken,
        shopCustomerId: order.customerId,
        clientIp: order.clientIpAddress,
        device: deviceFromUserAgent(order.clientUserAgent),
      };
      for (const productId of productIds) {
        await this.tracking.record({ ...base, productId });
      }
    } catch (err) {
      this.logger.warn(`Failed to record test_checkout_blocked for order ${order.id}: ${(err as Error).message}`);
    }
  }

  private async findTestProductIds(orderId: string): Promise<string[]> {
    const items = await this.prisma.orderItem.findMany({ where: { orderId }, select: { productId: true }, distinct: ['productId'] });
    const productIds = items.map((i) => i.productId).filter((id): id is string => !!id);
    if (!productIds.length) return [];

    const testProducts = await this.prisma.product.findMany({ where: { id: { in: productIds }, isTestProduct: true }, select: { id: true } });
    return testProducts.map((p) => p.id);
  }
}
