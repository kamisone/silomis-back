import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Stripe = require('stripe');
import { STRIPE_CLIENT } from './stripe.provider';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { TestCheckoutGuard } from '../orders/test-checkout-guard.service';
import { CommerceEventBus } from '../commerce-events/commerce-event-bus.service';
import { COMMERCE_EVENTS } from '../commerce-events/commerce-events.constants';
import { MetaCapiService } from '../marketing/meta-capi/meta-capi.service';
import { TikTokEventsService } from '../marketing/tiktok-events/tiktok-events.service';
import { Order, OrderStatus, PaymentTransaction, Prisma } from '../../generated/prisma/client';

const REFUNDABLE_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

/**
 * PaymentIntent states whose amount Stripe still allows changing. Anything else
 * (`processing`, `succeeded`, `requires_capture`) means the customer has already
 * committed, so the total must not move under them.
 */
const AMOUNT_MUTABLE_INTENT_STATUSES = new Set<string>(['requires_payment_method', 'requires_confirmation', 'requires_action']);

@Injectable()
export class ShopPaymentService {
  private readonly logger = new Logger(ShopPaymentService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe.Stripe,
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly testCheckoutGuard: TestCheckoutGuard,
    private readonly eventBus: CommerceEventBus,
    private readonly metaCapi: MetaCapiService,
    private readonly tiktokEvents: TikTokEventsService,
  ) {}

  // ── AddPaymentInfo tracking — fired once the customer reaches the payment
  // step (a PaymentIntent now exists for their order). Mirrors the
  // InitiateCheckout/Purchase pattern used by the marketing order listeners,
  // but this moment has no natural domain event to hook into, so it's called
  // directly from createPaymentIntent below. Best-effort: tracking failures
  // must never block payment.
  private async trackAddPaymentInfo(order: Order): Promise<{ metaEventId?: string; tiktokEventId?: string }> {
    try {
      const items = await this.prisma.orderItem.findMany({ where: { orderId: order.id } });
      const metaEventId = randomUUID();
      const tiktokEventId = randomUUID();
      const eventSourceUrl = `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout`;

      await this.metaCapi.sendEvent({
        eventName: 'AddPaymentInfo',
        eventId: metaEventId,
        eventSourceUrl,
        customData: {
          value: order.totalCents / 100,
          currency: 'EUR',
          content_type: 'product',
          content_ids: items.map((i) => i.variantId ?? i.productId ?? i.id),
          contents: items.map((i) => ({
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

      await this.tiktokEvents.sendEvent({
        eventName: 'AddPaymentInfo',
        eventId: tiktokEventId,
        eventSourceUrl,
        properties: {
          contents: items.map((i) => ({
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

      return { metaEventId, tiktokEventId };
    } catch (err) {
      this.logger.error(`Failed to send AddPaymentInfo events for order ${order.orderNumber}: ${(err as Error).message}`);
      return {};
    }
  }

  // ── Create payment intent for a shop order ──────────────────────────────

  async createPaymentIntent(orderId: string): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    metaAddPaymentInfoEventId?: string;
    tiktokAddPaymentInfoEventId?: string;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    // The storefront is already stopped at readyForPayment, but this route
    // is also reachable directly, which skips it. Re-check here so no path
    // can mint an intent for a test product.
    await this.testCheckoutGuard.assertCheckoutAllowed(order);

    if (order.status !== 'awaiting_payment') {
      throw new BadRequestException(`Order status "${order.status}" does not require payment`);
    }

    // Reuse existing intent if already created
    if (order.paymentIntentId) {
      const existing = await this.stripe.paymentIntents.retrieve(order.paymentIntentId);
      if (existing.status !== 'canceled') {
        // The customer can step back from payment and change shipping, which
        // moves the total. Without re-syncing, Stripe would still hold the
        // amount from the first visit and charge the wrong sum. Updating
        // keeps the same intent — and therefore the same client secret — so
        // the payment form does not have to be rebuilt.
        if (existing.amount !== order.totalCents) {
          if (!AMOUNT_MUTABLE_INTENT_STATUSES.has(existing.status)) {
            throw new BadRequestException('Payment is already in progress for this order — it can no longer be changed');
          }
          const updated = await this.stripe.paymentIntents.update(existing.id, {
            amount: order.totalCents,
          });
          this.logger.log(`Re-synced PaymentIntent ${existing.id} for order ${order.orderNumber}: ${existing.amount} -> ${order.totalCents} cents`);
          const tracked1 = await this.trackAddPaymentInfo(order);
          return {
            clientSecret: updated.client_secret!,
            paymentIntentId: updated.id,
            metaAddPaymentInfoEventId: tracked1.metaEventId,
            tiktokAddPaymentInfoEventId: tracked1.tiktokEventId,
          };
        }
        const tracked2 = await this.trackAddPaymentInfo(order);
        return {
          clientSecret: existing.client_secret!,
          paymentIntentId: existing.id,
          metaAddPaymentInfoEventId: tracked2.metaEventId,
          tiktokAddPaymentInfoEventId: tracked2.tiktokEventId,
        };
      }
    }

    const intent = await this.stripe.paymentIntents.create(
      {
        amount: order.totalCents,
        currency: 'eur',
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          platform: 'silomis-shop',
        },
      },
      { idempotencyKey: `shop-order-${order.id}` },
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentIntentId: intent.id },
    });

    const tracked3 = await this.trackAddPaymentInfo(order);
    return {
      clientSecret: intent.client_secret!,
      paymentIntentId: intent.id,
      metaAddPaymentInfoEventId: tracked3.metaEventId,
      tiktokAddPaymentInfoEventId: tracked3.tiktokEventId,
    };
  }

  // ── Admin-initiated refund ──────────────────────────────────────────────
  // Only calls Stripe. The PaymentTransaction ledger row and the order's
  // "refunded" status transition are both left to handleChargeRefunded()
  // below, reacting to the charge.refunded webhook this call triggers — the
  // same single path that already handles Dashboard-initiated refunds, so
  // there's exactly one place that ever records a refund, not two.

  async refundOrder(orderId: string, amountCents?: number): Promise<{ refundId: string; status: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.paymentIntentId) throw new BadRequestException('Order has no payment to refund');
    if (!REFUNDABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Order status "${order.status}" cannot be refunded`);
    }

    const refund = await this.stripe.refunds.create(
      {
        payment_intent: order.paymentIntentId,
        ...(amountCents ? { amount: amountCents } : {}),
      },
      {
        idempotencyKey: `shop-order-refund-${orderId}-${amountCents ?? 'full'}`,
      },
    );

    return { refundId: refund.id, status: refund.status ?? 'pending' };
  }

  // ── Process Stripe webhook ────────────────────────────────────────────

  async processWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_SHOP_WEBHOOK_SECRET!;
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody as unknown as Uint8Array, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    if (event.type === 'payment_intent.succeeded') {
      await this.handlePaymentSucceeded(event);
    }
    if (event.type === 'payment_intent.payment_failed') {
      await this.handlePaymentFailed(event);
    }
    if (event.type === 'charge.refunded') {
      await this.handleChargeRefunded(event);
    }
  }

  private async handlePaymentSucceeded(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata?.orderId;
    if (!orderId) {
      this.logger.warn(`Webhook ${event.id}: payment_intent.succeeded has no orderId in metadata`);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      this.logger.warn(`Webhook ${event.id}: order ${orderId} not found`);
      return;
    }

    const isNew = await this.recordTransactionIdempotent({
      orderId,
      provider: 'stripe',
      providerTransactionId: intent.id,
      webhookEventId: event.id,
      type: 'charge',
      status: 'succeeded',
      amountCents: intent.amount,
      currency: intent.currency.toUpperCase(),
      metadata: { intentId: intent.id },
    });
    if (!isNew) {
      this.logger.debug(`Webhook ${event.id}: already processed (idempotent skip)`);
      return;
    }

    try {
      await this.ordersService.confirmPayment(orderId, intent.id);
      this.logger.log(`Webhook ${event.id}: order ${orderId} confirmed as paid`);
    } catch (err) {
      this.logger.error(`Webhook ${event.id}: confirmPayment failed for order ${orderId} (status="${order.status}") — manual review needed`, (err as Error).message);
      return;
    }

    this.eventBus.emit(COMMERCE_EVENTS.PAYMENT_SUCCEEDED, { orderId, paymentIntentId: intent.id, amountCents: intent.amount }, { entityId: orderId, source: 'ShopPaymentService.webhook' });
  }

  private async handlePaymentFailed(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata?.orderId;
    if (!orderId) return;

    const isNew = await this.recordTransactionIdempotent({
      orderId,
      provider: 'stripe',
      providerTransactionId: intent.id,
      webhookEventId: event.id,
      type: 'charge',
      status: 'failed',
      amountCents: intent.amount,
      currency: intent.currency.toUpperCase(),
      metadata: null,
    });
    if (!isNew) return;

    // Release inventory by cancelling the order immediately on payment
    // failure. Without this, the order stays in awaiting_payment until the
    // reservation-expiry job fires.
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (order && (order.status === 'draft' || order.status === 'awaiting_payment')) {
      try {
        await this.ordersService.transition(order.id, 'cancelled', 'Payment failed — inventory released');
      } catch (err) {
        this.logger.warn(`Could not cancel order ${orderId} on payment failure: ${(err as Error).message}`);
      }
    }

    this.eventBus.emit(COMMERCE_EVENTS.PAYMENT_FAILED, { orderId, paymentIntentId: intent.id }, { entityId: orderId, source: 'ShopPaymentService.webhook' });
  }

  private async handleChargeRefunded(event: Stripe.Event): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!paymentIntentId) return;

    const order = await this.prisma.order.findFirst({
      where: { paymentIntentId },
    });
    if (!order) return;

    const isNew = await this.recordTransactionIdempotent({
      orderId: order.id,
      provider: 'stripe',
      providerTransactionId: charge.id,
      webhookEventId: event.id,
      type: 'refund',
      status: 'succeeded',
      amountCents: charge.amount_refunded,
      currency: charge.currency.toUpperCase(),
      metadata: null,
    });
    if (!isNew) return;

    if (order.status !== 'refunded') {
      await this.ordersService.transition(order.id, 'refunded', 'Refunded via Stripe');
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Inserts a PaymentTransaction record, deduped on webhookEventId. Returns false if already recorded (idempotent skip). */
  private async recordTransactionIdempotent(data: Omit<PaymentTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<boolean> {
    try {
      await this.prisma.paymentTransaction.create({ data });
      return true;
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false; // unique constraint: concurrent/replayed delivery
      throw err;
    }
  }
}
