import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CustomerService } from '../customers/customer.service';
import { ShippingService } from '../shipping/shipping.service';
import { CommerceEventBus } from '../commerce-events/commerce-event-bus.service';
import { COMMERCE_EVENTS, OrderStatusChangedEvent } from '../commerce-events/commerce-events.constants';
import { TranslationsService } from '../translations/translations.service';
import { containsTestProduct } from '../common/utils/test-product.util';
import { resolveUnitPriceForQuantity, sumOptionAdjustments } from '../pricing/variant-price.util';
import { CHECKOUT_RESERVATION_QUEUE } from '../checkout/checkout-reservation.constants';
import { CreateOrderDto, OrderListFilter } from './dto/order.dto';
import { CartItem, Order, OrderStatus, Prisma } from '../../generated/prisma/client';

const ET_SHOP_PRODUCT = 'shop_product';
const ET_VARIANT_ATTR = 'shop_variant_attribute';
const ET_VARIATION_OPTION = 'shop_variation_option_value';

// ── State machine ─────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['awaiting_payment', 'cancelled'],
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

/** Order statuses that represent a successfully completed purchase. */
const REVIEWABLE_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly customerService: CustomerService,
    private readonly shipping: ShippingService,
    private readonly eventBus: CommerceEventBus,
    private readonly translations: TranslationsService,
    @InjectQueue(CHECKOUT_RESERVATION_QUEUE)
    private readonly reservationQueue: Queue,
  ) {}

  // ── Create from cart ──────────────────────────────────────────────────
  // A second, independent order-creation path alongside CheckoutService.initiate
  // — used for flows that already know their shipping cost up front rather
  // than working through the multi-step checkout session. Skips draft entirely.

  async createFromCart(dto: CreateOrderDto): Promise<Order> {
    const cart = await this.prisma.cart.findFirst({
      where: { token: dto.cartToken, status: 'active' },
      include: { items: true },
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    if (!cart.items.length) throw new BadRequestException('Cart is empty');

    const items = cart.items;
    await this.verifyCartItemPrices(items);

    const orderProductIds = [...new Set(items.map((i) => i.productId))];
    const isTestOrder = await containsTestProduct(this.prisma, orderProductIds);

    // All-or-nothing free shipping: free only when every distinct product in
    // the order carries the flag — mirrors the pricing engine's rule so this
    // path never promises something checkout wouldn't honour.
    const freeShippingCount = orderProductIds.length
      ? await this.prisma.product.count({
          where: { id: { in: orderProductIds }, freeShipping: true },
        })
      : 0;
    const shipsFree = orderProductIds.length > 0 && freeShippingCount === orderProductIds.length;

    const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
    const shippingCents = shipsFree ? 0 : await this.resolveShippingCents(dto, subtotalCents);
    const totalCents = Math.max(0, subtotalCents + shippingCents);

    const order = await this.prisma.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('shop_order_number_seq') AS n`;
      const orderNumber = `ORD-${String(n).padStart(6, '0')}`;

      const created = await tx.order.create({
        data: {
          orderNumber,
          status: 'awaiting_payment',
          isTestOrder,
          userId: dto.userId ?? null,
          customerEmail: dto.customerEmail,
          customerName: dto.customerName ?? null,
          customerPhone: dto.customerPhone ?? null,
          shippingAddressSnapshot: dto.shippingAddress as Prisma.InputJsonValue,
          billingAddressSnapshot: (dto.billingAddress as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          subtotalCents,
          shippingCents,
          discountCents: 0,
          taxCents: 0,
          totalCents,
          trackingToken: randomUUID(),
          shippingMethodId: dto.shippingMethodId ?? null,
        },
      });

      for (const item of items) {
        await this.inventory.reserveForOrder(item.variantId, item.quantity, created.id, tx);
      }

      await tx.orderItem.createMany({
        data: items.map((item) => ({
          orderId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          titleSnapshot: item.titleSnapshot,
          skuSnapshot: item.skuSnapshot,
          imageKeySnapshot: item.imageKeySnapshot,
          optionsSnapshot: item.optionsSnapshot as Prisma.InputJsonValue,
          compareAtPriceCentsSnapshot: item.compareAtPriceCentsSnapshot,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.unitPriceCents * item.quantity,
        })),
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          fromStatus: null,
          toStatus: 'awaiting_payment',
          note: 'Order created',
        },
      });
      await tx.cart.update({
        where: { id: cart.id },
        data: { status: 'completed' },
      });
      await this.customerService.upsertFromOrder(dto.customerEmail, dto.customerName ?? null, dto.customerPhone ?? null, dto.userId ?? null, tx);

      return created;
    });

    return order;
  }

  // ── Transition status ─────────────────────────────────────────────────

  async transition(orderId: string, toStatus: OrderStatus, note?: string, adminId?: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const prev = order.status;
    const allowed = ALLOWED_TRANSITIONS[prev] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`Cannot transition from "${prev}" to "${toStatus}"`);
    }

    // Status change, status-history row, and every inventory bucket movement
    // it triggers all commit or roll back together — passing `tx` down to
    // InventoryService means a failure partway through (e.g. one variant's
    // movement throwing) leaves the order status unchanged too, instead of
    // the order advancing to "shipped" while stock never actually moved.
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: toStatus },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: prev,
          toStatus,
          note: note ?? null,
          adminId: adminId ?? null,
        },
      });

      const items = await tx.orderItem.findMany({ where: { orderId } });

      if (toStatus === 'cancelled' || toStatus === 'refunded') {
        for (const item of items) {
          if (!item.variantId) continue;
          if (prev === 'paid' || prev === 'processing') {
            // Already moved Reserved -> Committed on payment; release back to Available.
            await this.inventory.releaseCommittedForOrder(item.variantId, item.quantity, orderId, tx);
          } else if (prev !== 'shipped' && prev !== 'delivered') {
            // Still in the unpaid Reserved bucket (draft/pending/awaiting_payment).
            await this.inventory.releaseForOrder(item.variantId, item.quantity, orderId, tx);
          }
          // shipped/delivered -> refunded: stock was already confirmed sold; no automatic restock.
        }
      }

      if (toStatus === 'paid') {
        for (const item of items) if (item.variantId) await this.inventory.commitForOrder(item.variantId, item.quantity, orderId, tx);
        // Revenue is realized once payment is confirmed — update customer lifetime stats.
        await this.customerService.recordOrderCompletion(order.customerEmail, order.totalCents, tx);
        // Coupon usage is only counted once payment is confirmed — matches
        // confirmPayment()'s "if already paid, return" guard, which is the
        // only path into this branch, so a webhook replay can't double-count.
        if (order.couponCode) {
          await tx.shopPromotion.updateMany({
            where: { code: order.couponCode, trigger: 'coupon' },
            data: { usesCount: { increment: 1 } },
          });
        }
      }

      if (toStatus === 'shipped') {
        for (const item of items) if (item.variantId) await this.inventory.confirmSale(item.variantId, item.quantity, orderId, tx);
      }

      return updated;
    });

    this.eventBus.emit(
      COMMERCE_EVENTS.ORDER_STATUS_CHANGED,
      {
        orderId,
        fromStatus: prev,
        toStatus,
        triggeredBy: adminId ? 'admin' : 'system',
      } satisfies OrderStatusChangedEvent,
      { entityId: orderId, source: 'OrdersService.transition' },
    );

    return result;
  }

  // ── Confirm payment (idempotent — target for the future Stripe webhook) ──

  async confirmPayment(orderId: string, paymentIntentId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'paid') return order; // idempotent

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentIntentId },
    });

    // Cancel the pending reservation-expiry job — order is paid, no need to expire it.
    this.reservationQueue.remove(`expire-${orderId}`).catch((err) => this.logger.debug(`Could not remove expiry job for ${orderId}: ${(err as Error).message}`));

    // Draft orders skipped the awaiting_payment step — transition through it.
    if (order.status === 'draft') {
      await this.transition(orderId, 'awaiting_payment', 'Payment initiated');
    }
    const paid = await this.transition(orderId, 'paid', 'Payment confirmed');

    // Only now is the cart truly "spent" — mark it completed so a fresh empty
    // cart is created for the customer's next visit, while preserving the
    // (now-paid) order's snapshot of the items.
    if (order.cartToken) {
      await this.prisma.cart.updateMany({
        where: { token: order.cartToken, status: 'active' },
        data: { status: 'completed' },
      });
    }

    return paid;
  }

  // ── List / lookup ─────────────────────────────────────────────────────

  async adminList(filter: OrderListFilter = {}) {
    const { status, search, limit = 20, offset = 0 } = filter;
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status: status as OrderStatus } : {}),
      ...(search
        ? {
            OR: [{ orderNumber: { contains: search, mode: 'insensitive' } }, { customerEmail: { contains: search, mode: 'insensitive' } }, { customerName: { contains: search, mode: 'insensitive' } }],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total };
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        shippingMethod: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findByNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Proof-of-ownership for a guest order: the tracking token, or a matching email. */
  private isAuthorized(order: Order, auth: { token?: string; email?: string }): boolean {
    return !!((auth.token && order.trackingToken === auth.token) || (auth.email && order.customerEmail.toLowerCase() === auth.email.toLowerCase()));
  }

  /**
   * Verifies that `auth` proves ownership of `orderNumber`, that the order was
   * successfully paid, and that `productId` was actually purchased on it.
   * Returns null on ANY failure (never throws) so callers can return one
   * identical "not verified" response regardless of which check failed.
   */
  async verifyOrderForReview(orderNumber: string, productId: string, auth: { token?: string; email?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: { items: true },
    });
    if (!order) return null;
    if (!this.isAuthorized(order, auth)) return null;
    if (!REVIEWABLE_STATUSES.includes(order.status)) return null;

    const orderItem = order.items.find((i) => i.productId === productId);
    if (!orderItem) return null;

    return { order, orderItem };
  }

  async trackOrder(orderNumber: string, auth: { token?: string; email?: string }, lang?: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!this.isAuthorized(order, auth)) throw new NotFoundException('Order not found');

    // titleSnapshot/optionsSnapshot are frozen in the base (French) language
    // at order-creation time — same gap Cart's enrichCart has for its own
    // snapshots — so they need the same per-request overlay.
    let titleMap = new Map<string, string>();
    let attrMap = new Map<string, Record<string, unknown>>();
    let optionMap = new Map<string, Record<string, unknown>>();
    if (lang) {
      const items = order.items;
      const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
      type OptSnap = { attributeId: string; optionValueId: string | null };
      const attrIds = [...new Set(items.flatMap((i) => ((i.optionsSnapshot as unknown as OptSnap[]) ?? []).map((o) => o.attributeId).filter(Boolean)))];
      const optionIds = [...new Set(items.flatMap((i) => ((i.optionsSnapshot as unknown as OptSnap[]) ?? []).map((o) => o.optionValueId).filter(Boolean) as string[]))];

      const [titles, attrs, options] = await Promise.all([
        productIds.length
          ? this.translations.applyToEntities(
              productIds.map((id) => ({ id })),
              ET_SHOP_PRODUCT,
              lang,
            )
          : Promise.resolve([]),
        attrIds.length
          ? this.translations.applyToEntities(
              attrIds.map((id) => ({ id })),
              ET_VARIANT_ATTR,
              lang,
            )
          : Promise.resolve([]),
        optionIds.length
          ? this.translations.applyToEntities(
              optionIds.map((id) => ({ id })),
              ET_VARIATION_OPTION,
              lang,
            )
          : Promise.resolve([]),
      ]);
      titleMap = new Map(titles.map((r: Record<string, unknown>) => [r.id as string, r.title as string]));
      attrMap = new Map(attrs.map((r: Record<string, unknown>) => [r.id as string, r]));
      optionMap = new Map(options.map((r: Record<string, unknown>) => [r.id as string, r]));
    }

    const timeline = order.statusHistory.map((h) => ({
      status: h.toStatus,
      date: h.createdAt,
      note: h.note,
    }));

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customerName,
      totalCents: order.totalCents,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      discountCents: order.discountCents,
      couponCode: order.couponCode,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        title: (i.productId && titleMap.get(i.productId)) ?? i.titleSnapshot,
        sku: i.skuSnapshot,
        imageKey: i.imageKeySnapshot,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        totalCents: i.totalCents,
        options: (
          (i.optionsSnapshot as unknown as Array<{
            attributeId: string;
            attributeName: string;
            optionValueId: string | null;
            value: string;
            displayValue: string | null;
          }>) ?? []
        ).map((o) => ({
          ...o,
          attributeName: (attrMap.get(o.attributeId)?.name as string | undefined) ?? o.attributeName,
          displayValue: o.optionValueId ? ((optionMap.get(o.optionValueId)?.displayValue as string | undefined) ?? o.displayValue) : o.displayValue,
        })),
        productId: i.productId,
        variantId: i.variantId,
      })),
      // Shipment tracking is populated once the Shipping domain exists.
      shipping: null,
      timeline,
    };
  }

  customerOrders(email: string) {
    return this.prisma.order.findMany({
      where: { customerEmail: email },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  // ── Shipping resolution ────────────────────────────────────────────────
  // Never trust a client-supplied shipping amount — re-quote server-side
  // against the same ShippingService CheckoutService uses, and only accept
  // a price that quote actually offered for this address.

  private async resolveShippingCents(dto: CreateOrderDto, subtotalCents: number): Promise<number> {
    if (!dto.shippingMethodId) throw new BadRequestException('A shipping method is required');

    const country = dto.shippingAddress.country;
    const quote = await this.shipping.getMethodsForCountry(country, subtotalCents);
    const method = quote.methods.find((m) => m.id === dto.shippingMethodId);
    if (!method) throw new BadRequestException('Selected shipping method is not available for this order');

    return method.priceCents;
  }

  // ── Price verification ────────────────────────────────────────────────

  async verifyCartItemPrices(items: CartItem[]): Promise<void> {
    const variantIds = [...new Set(items.map((i) => i.variantId))];
    const productIds = [...new Set(items.map((i) => i.productId))];

    const [variants, products] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { options: { include: { optionValue: true } } },
      }),
      this.prisma.product.findMany({ where: { id: { in: productIds } } }),
    ]);

    const variantMap = new Map(variants.map((v) => [v.id, v]));
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of items) {
      const variant = variantMap.get(item.variantId);
      if (!variant) throw new BadRequestException(`Variant "${item.variantId}" no longer exists. Please update your cart.`);

      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Product "${item.productId}" no longer exists. Please update your cart.`);
      if (product.status !== 'active') throw new BadRequestException(`Product "${product.title}" is no longer available.`);

      // Quantity-aware: an upselling product's line must re-verify at the
      // tier price for item.quantity, not the flat variant/option price.
      const currentPrice = resolveUnitPriceForQuantity(
        {
          variantPriceCents: variant.priceCents,
          basePriceCents: product.basePriceCents,
          optionAdjustmentCents: sumOptionAdjustments(variant.options),
        },
        item.quantity,
        {
          upsellingEnabled: product.upsellingEnabled,
          upsellTiers: product.upsellTiers as never,
        },
      );

      if (currentPrice !== item.unitPriceCents) {
        throw new BadRequestException({
          code: 'PRICE_CHANGED',
          message: `Price for "${item.titleSnapshot ?? item.variantId}" has changed. Please refresh your cart.`,
          variantId: item.variantId,
          cartPriceCents: item.unitPriceCents,
          currentPriceCents: currentPrice,
        });
      }
    }
  }
}
