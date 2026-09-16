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
import { CommerceNotificationService } from '../commerce-notifications/commerce-notification.service';
import { Order, OrderStatus, PaymentTransaction, Prisma } from '../../generated/prisma/client';

/** Orders a succeeded intent may still turn into a sale — including one the reservation timer cancelled. */
const RECONCILABLE_STATUSES = new Set<OrderStatus>(['draft', 'awaiting_payment', 'cancelled']);
/** How far back the sweep looks: an intent older than this is not going to succeed quietly. */
const RECONCILE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

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
    private readonly notifications: CommerceNotificationService,
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
    // The card form is on screen: the clock restarts here.
    await this.ordersService.extendReservation(orderId);

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
      // Keyed on the intent, not the event: a redelivered event and a
      // reconciliation that got there first are both the same money.
      webhookEventId: `pi:${intent.id}`,
      type: 'charge',
      status: 'succeeded',
      amountCents: intent.amount,
      currency: intent.currency.toUpperCase(),
      metadata: { intentId: intent.id, eventId: event.id },
    });
    if (!isNew) {
      this.logger.debug(`Webhook ${event.id}: already processed (idempotent skip)`);
      // Ledgered but possibly not yet paid (a reconcile that failed midway):
      // confirmPayment is idempotent, so following through costs nothing.
      if (order.status !== 'paid') await this.settle(orderId, intent, `webhook ${event.id}`);
      return;
    }

    await this.settle(orderId, intent, `webhook ${event.id}`);
  }

  /**
   * The one place an order becomes paid. Both the webhook and the
   * reconciliation below land here; the ledger row was written first (and is
   * unique per intent), so whichever arrives second is a no-op.
   */
  private async settle(orderId: string, intent: Stripe.PaymentIntent, via: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, orderNumber: true } });
    if (!order) return false;
    try {
      await this.ordersService.confirmPayment(orderId, intent.id);
      this.logger.log(`${via}: order ${order.orderNumber} confirmed as paid`);
    } catch (err) {
      this.logger.error(`${via}: confirmPayment failed for order ${order.orderNumber} (status="${order.status}") — manual review needed`, (err as Error).message);
      // Money in Stripe, order not paid: the one case nobody should find out
      // about from a customer's email a week later.
      await this.notifications
        .notify({
          event: 'payment_succeeded',
          orderId,
          orderNumber: order.orderNumber,
          summary: `ATTENTION — Stripe holds a succeeded payment (${intent.id}, ${(intent.amount / 100).toFixed(2)} ${intent.currency.toUpperCase()}) for order ${order.orderNumber}, but the order is "${order.status}" and could not be marked paid: ${(err as Error).message}. Refund it or restore the order by hand.`,
          detailUrl: process.env.APP_URL ? `${process.env.APP_URL}/admin/shop/orders/${orderId}` : null,
        })
        .catch(() => undefined);
      return false;
    }
    this.eventBus.emit(COMMERCE_EVENTS.PAYMENT_SUCCEEDED, { orderId, paymentIntentId: intent.id, amountCents: intent.amount }, { entityId: orderId, source: `ShopPaymentService.${via.split(' ')[0]}` });
    return true;
  }

  // ── Reconciliation ────────────────────────────────────────────────────
  // The webhook is the normal path, but it is also the one thing between
  // "the customer paid" and "the shop knows" that the shop does not control:
  // an endpoint not yet registered in the Stripe dashboard, a secret that
  // does not match, a dev machine without `stripe listen`, an outage during
  // the retries. Asking Stripe directly closes that gap — on the return to
  // the success page, whenever the order is looked at, and on a timer.

  /**
   * Asks Stripe whether this order's intent has succeeded, and settles it if
   * so. Cheap and idempotent: safe to call from a page load. Returns the
   * order's status afterwards, or null when there is nothing to reconcile.
   */
  async reconcileOrder(orderId: string): Promise<{ status: OrderStatus; reconciled: boolean } | null> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, paymentIntentId: true, orderNumber: true } });
    if (!order) return null;
    if (!order.paymentIntentId) return { status: order.status, reconciled: false };
    if (!RECONCILABLE_STATUSES.has(order.status)) return { status: order.status, reconciled: false };

    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.stripe.paymentIntents.retrieve(order.paymentIntentId);
    } catch (err) {
      this.logger.warn(`Reconcile ${order.orderNumber}: could not read intent ${order.paymentIntentId}: ${(err as Error).message}`);
      return { status: order.status, reconciled: false };
    }
    if (intent.status !== 'succeeded') return { status: order.status, reconciled: false };
    if (intent.metadata?.orderId && intent.metadata.orderId !== orderId) {
      this.logger.error(`Reconcile ${order.orderNumber}: intent ${intent.id} belongs to order ${intent.metadata.orderId}`);
      return { status: order.status, reconciled: false };
    }

    const isNew = await this.recordTransactionIdempotent({
      orderId,
      provider: 'stripe',
      providerTransactionId: intent.id,
      // One ledger row per intent whichever path wrote it: the webhook's own
      // event id would be a second key for the same money, so the row is
      // keyed on the intent and the webhook then reads as already processed.
      webhookEventId: `pi:${intent.id}`,
      type: 'charge',
      status: 'succeeded',
      amountCents: intent.amount,
      currency: intent.currency.toUpperCase(),
      metadata: { intentId: intent.id, reconciled: true },
    });
    if (!isNew) {
      // Ledgered already (the webhook got there) — but make sure the order
      // itself followed; confirmPayment is idempotent.
      if (order.status !== 'paid') await this.settle(orderId, intent, 'reconcile');
      const after = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
      return { status: after?.status ?? order.status, reconciled: false };
    }
    this.logger.warn(`Reconcile ${order.orderNumber}: Stripe says intent ${intent.id} succeeded but no webhook settled it — settling now`);
    const ok = await this.settle(orderId, intent, 'reconcile');
    const after = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    return { status: after?.status ?? order.status, reconciled: ok };
  }

  /**
   * Every order still waiting on a payment that Stripe may already hold —
   * recent, with an intent — checked in turn. What the timer runs.
   */
  async reconcilePending(limit = 50): Promise<number> {
    const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
    const rows = await this.prisma.order.findMany({
      // Not the cancelled ones: those are settled on demand (the success
      // page, the tracking page, the expiry timer) — a person's cancellation
      // with money behind it is alerted once, not every five minutes.
      where: { status: { in: ['draft', 'awaiting_payment'] }, paymentIntentId: { not: null }, updatedAt: { gte: since } },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    let settled = 0;
    for (const r of rows) {
      const res = await this.reconcileOrder(r.id).catch((err: Error) => {
        this.logger.warn(`Reconcile sweep: order ${r.id} failed: ${err.message}`);
        return null;
      });
      if (res?.reconciled) settled += 1;
    }
    return settled;
  }

  /**
   * Whether Stripe already holds the money for this order — what the
   * reservation timer asks before cancelling. `succeeded` settles the order
   * on the spot; `processing` (a bank transfer, a slow 3-D Secure) means
   * "not yet, do not cancel".
   */
  async intentState(orderId: string): Promise<'succeeded' | 'processing' | 'none'> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { paymentIntentId: true } });
    if (!order?.paymentIntentId) return 'none';
    try {
      const intent = await this.stripe.paymentIntents.retrieve(order.paymentIntentId);
      if (intent.status === 'succeeded') {
        await this.reconcileOrder(orderId);
        return 'succeeded';
      }
      if (intent.status === 'processing' || intent.status === 'requires_action' || intent.status === 'requires_capture') return 'processing';
      return 'none';
    } catch (err) {
      this.logger.warn(`Intent state for ${orderId} unreadable: ${(err as Error).message}`);
      // Unknown is treated as "maybe paid": cancelling a paid order is the
      // worse mistake, and the sweep will settle it later.
      return 'processing';
    }
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
