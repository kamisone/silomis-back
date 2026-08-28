import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CommerceEventBus } from '../commerce-events/commerce-event-bus.service';
import { COMMERCE_EVENTS } from '../commerce-events/commerce-events.constants';
import { TestCheckoutGuard } from '../orders/test-checkout-guard.service';
import { OrdersService } from '../orders/orders.service';
import { CustomerService } from '../customers/customer.service';
import {
  FREE_SHIPPING_METHOD_ID,
  QuotedMethod,
  ShippingService,
} from '../shipping/shipping.service';
import {
  PricingEngineService,
  LineItemInput,
  PricingResult,
} from '../promotions/pricing-engine.service';
import { containsTestProduct } from '../common/utils/test-product.util';
import {
  CHECKOUT_RESERVATION_QUEUE,
  RESERVATION_TTL_MS,
  ReservationExpiryJobData,
} from './checkout-reservation.constants';
import { InitiateCheckoutDto } from './dto/checkout.dto';
import { UpdateShippingDto } from '../shipping/dto/shipping.dto';
import { PickupPointsService, PickupPointSnapshot } from '../shipping/pickup-points/pickup-points.service';
import { SelectPickupPointDto } from '../shipping/pickup-points/dto/pickup-point.dto';
import { CartItem, Order, Prisma } from '../../generated/prisma/client';

// ── Response ────────────────────────────────────────────────────────────

export interface CheckoutSnapshot {
  orderId: string;
  orderNumber: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  categoryDiscountCents: number;
  couponCode: string | null;
  totalCents: number;
  /** All-or-nothing: true only when every distinct product in the order carries Product.freeShipping. */
  freeShipping: boolean;
  shippingMethodId: string | null;
  /** Quoted methods for the order's current shipping address — empty until an address is set. */
  shippingMethods: QuotedMethod[];
  /** Chosen pickup point, when the selected method requires one. Cleared with the method. */
  pickupPoint: PickupPointSnapshot | null;
  reservationExpiresAt: string | null;
  trackingToken: string | null;
}

interface ShippingContext {
  freeShipping: boolean;
  upgradeMethodIds: string[];
  freeDaysMin: number | null;
  freeDaysMax: number | null;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly eventBus: CommerceEventBus,
    private readonly testCheckoutGuard: TestCheckoutGuard,
    private readonly ordersService: OrdersService,
    private readonly customerService: CustomerService,
    private readonly shipping: ShippingService,
    private readonly pickupPoints: PickupPointsService,
    private readonly pricingEngine: PricingEngineService,
    @InjectQueue(CHECKOUT_RESERVATION_QUEUE)
    private readonly reservationQueue: Queue,
  ) {}

  // ── Initiate checkout ──────────────────────────────────────────────────
  // Creates a draft order with server-computed totals and inventory
  // reservation. Idempotent: returns the existing draft order for the same
  // cart token if one is already in progress.

  async initiate(
    dto: InitiateCheckoutDto,
    requestMeta?: { ip: string | null; userAgent: string | null },
  ): Promise<CheckoutSnapshot> {
    const cart = await this.prisma.cart.findFirst({
      where: { token: dto.cartToken, status: 'active' },
      include: { items: true },
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    if (!cart.items.length) throw new BadRequestException('Cart is empty');

    const items = cart.items;

    // Idempotency: the cart stays "active" (and its items visible) until
    // payment is confirmed, so a page refresh during checkout must resume
    // this order rather than creating a duplicate (and double-reserving stock).
    const existing = await this.prisma.order.findFirst({
      where: {
        cartToken: dto.cartToken,
        status: { in: ['draft', 'awaiting_payment'] },
      },
    });
    if (existing) {
      const productIds = [...new Set(items.map((i) => i.productId))];
      const subtotalCents = items.reduce(
        (sum, i) => sum + i.unitPriceCents * i.quantity,
        0,
      );
      const pricing = await this.computePricing(items, dto.couponCode);
      const totalCents =
        subtotalCents -
        pricing.categoryDiscountCents -
        pricing.priceRuleDiscountCents -
        pricing.couponDiscountCents;

      const updated = await this.prisma.order.update({
        where: { id: existing.id },
        data: {
          customerEmail: dto.email,
          customerName:
            `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() ||
            dto.companyName?.trim() ||
            null,
          customerCompanyName: dto.companyName?.trim() || null,
          customerPhone: dto.phone ?? null,
          customerLocale: dto.locale ?? 'fr',
          clientIpAddress: requestMeta?.ip ?? existing.clientIpAddress,
          clientUserAgent: requestMeta?.userAgent ?? existing.clientUserAgent,
          metaClickId: dto.fbc ?? existing.metaClickId,
          metaBrowserId: dto.fbp ?? existing.metaBrowserId,
          tiktokClickId: dto.ttclid ?? existing.tiktokClickId,
          tiktokBrowserId: dto.ttp ?? existing.tiktokBrowserId,
          shippingAddressSnapshot: this.buildAddressSnapshot(
            dto,
          ) as Prisma.InputJsonValue,
          subtotalCents,
          // Re-quoting requires a fresh shipping-method pick since the
          // address/cart may have changed since the last quote. The pickup
          // point goes with it: it belongs to a country and a carrier method,
          // and this branch is exactly how a changed shipping country arrives.
          shippingMethodId: null,
          shippingCents: 0,
          pickupPointSnapshot: Prisma.DbNull,
          categoryDiscountCents:
            pricing.categoryDiscountCents + pricing.priceRuleDiscountCents,
          discountCents: pricing.couponDiscountCents,
          couponCode: pricing.couponCode,
          totalCents,
          pricingSnapshot: pricing as unknown as Prisma.InputJsonValue,
          // Re-evaluate: a product may have been flagged as a test after this
          // order was created, and this branch is how a mid-checkout refresh resumes.
          isTestOrder: await containsTestProduct(this.prisma, productIds),
        },
      });
      return this.toSnapshot(updated);
    }

    await this.ordersService.verifyCartItemPrices(items);

    const productIds = [...new Set(items.map((i) => i.productId))];
    const isTestOrder = await containsTestProduct(this.prisma, productIds);
    const subtotalCents = items.reduce(
      (sum, i) => sum + i.unitPriceCents * i.quantity,
      0,
    );
    const pricing = await this.computePricing(items, dto.couponCode);
    const totalCents =
      subtotalCents -
      pricing.categoryDiscountCents -
      pricing.priceRuleDiscountCents -
      pricing.couponDiscountCents;

    const order = await this.prisma.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT nextval('shop_order_number_seq') AS n`;
      const orderNumber = `ORD-${String(n).padStart(6, '0')}`;
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

      const created = await tx.order.create({
        data: {
          orderNumber,
          status: 'draft',
          isTestOrder,
          cartToken: dto.cartToken,
          customerEmail: dto.email,
          customerName:
            `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() ||
            dto.companyName?.trim() ||
            null,
          customerCompanyName: dto.companyName?.trim() || null,
          customerPhone: dto.phone ?? null,
          customerLocale: dto.locale ?? 'fr',
          clientIpAddress: requestMeta?.ip ?? null,
          clientUserAgent: requestMeta?.userAgent ?? null,
          metaClickId: dto.fbc ?? null,
          metaBrowserId: dto.fbp ?? null,
          tiktokClickId: dto.ttclid ?? null,
          tiktokBrowserId: dto.ttp ?? null,
          shippingAddressSnapshot: this.buildAddressSnapshot(
            dto,
          ) as Prisma.InputJsonValue,
          subtotalCents,
          shippingCents: 0,
          categoryDiscountCents:
            pricing.categoryDiscountCents + pricing.priceRuleDiscountCents,
          discountCents: pricing.couponDiscountCents,
          couponCode: pricing.couponCode,
          taxCents: 0,
          totalCents,
          pricingSnapshot: pricing as unknown as Prisma.InputJsonValue,
          trackingToken: randomUUID(),
          reservationExpiresAt: expiresAt,
        },
      });

      for (const item of items) {
        await this.inventory.reserveForOrder(
          item.variantId,
          item.quantity,
          created.id,
          tx,
        );
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
          toStatus: 'draft',
          note: 'Checkout initiated',
        },
      });

      return created;
    });

    await this.reservationQueue.add(
      'expire-reservation',
      { orderId: order.id } satisfies ReservationExpiryJobData,
      {
        jobId: `expire-${order.id}`,
        delay: RESERVATION_TTL_MS,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.eventBus.emit(
      COMMERCE_EVENTS.ORDER_CREATED,
      { orderId: order.id, orderNumber: order.orderNumber },
      { entityId: order.id, source: 'CheckoutService.initiate' },
    );

    return this.toSnapshot(order);
  }

  // ── Shipping method selection ──────────────────────────────────────────
  // Editable while the order is draft or awaiting_payment. Re-derives the
  // quote server-side and trusts its already-computed priceCents rather than
  // whatever the client sends, so free/upgrade pricing can't be spoofed.

  async updateShipping(
    orderId: string,
    dto: UpdateShippingDto,
  ): Promise<CheckoutSnapshot> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'draft' && order.status !== 'awaiting_payment') {
      throw new BadRequestException(
        'Shipping method can only be changed before payment',
      );
    }

    const address = order.shippingAddressSnapshot as {
      country?: string;
    } | null;
    const country = address?.country;
    if (!country)
      throw new BadRequestException('Order has no shipping address');

    const productIds = await this.orderProductIds(orderId);
    const ctx = await this.resolveShippingContext(
      productIds,
      order.pricingSnapshot,
    );
    const quote = await this.shipping.getMethodsForCountry(
      country,
      order.subtotalCents,
      order.customerLocale,
      {
        forceFree: ctx.freeShipping,
        upgradeMethodIds: ctx.upgradeMethodIds,
        freeDaysMin: ctx.freeDaysMin,
        freeDaysMax: ctx.freeDaysMax,
        productIds,
      },
    );
    const method = quote.methods.find((m) => m.id === dto.shippingMethodId);
    if (!method)
      throw new BadRequestException(
        'Selected shipping method is not available for this order',
      );

    const shippingMethodId =
      method.id === FREE_SHIPPING_METHOD_ID ? null : method.id;
    const totalCents =
      order.subtotalCents -
      order.discountCents -
      order.categoryDiscountCents +
      order.taxCents +
      method.priceCents;

    // A pickup point belongs to the method it was chosen under. Switching
    // methods — including switching between two pickup-point methods, whose
    // point ids come from different carrier networks — always discards it.
    const keepPickupPoint =
      method.requiresPickupPoint && order.shippingMethodId === shippingMethodId;

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        shippingMethodId,
        shippingCents: method.priceCents,
        totalCents,
        ...(keepPickupPoint ? {} : { pickupPointSnapshot: Prisma.DbNull }),
      },
    });

    return this.toSnapshot(updated);
  }

  // ── Pickup-point selection ────────────────────────────────────────────

  /**
   * Attaches a carrier pickup point to the order.
   *
   * The client sends only an id; every stored field is re-read from the
   * carrier (PickupPointsService.resolveForOrder), against the country on the
   * order's own address. So a forged id fails, a point in the wrong country
   * fails, and a point that closed since the customer searched fails — none of
   * which the browser could be trusted to enforce.
   */
  async selectPickupPoint(
    orderId: string,
    dto: SelectPickupPointDto,
  ): Promise<CheckoutSnapshot> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'draft' && order.status !== 'awaiting_payment') {
      throw new BadRequestException(
        'Pickup point can only be changed before payment',
      );
    }

    const method = await this.selectedPickupPointMethod(order);
    if (!method) {
      throw new BadRequestException(
        'The selected shipping method does not use a pickup point',
      );
    }

    const snapshot = await this.pickupPoints.resolveForOrder(
      orderId,
      dto.pickupPointId,
    );

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        pickupPointSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toSnapshot(updated);
  }

  /**
   * The order's currently selected method when it requires a pickup point,
   * otherwise null. A free-shipping order has no shippingMethodId at all, and
   * the synthetic free option never requires one.
   */
  private async selectedPickupPointMethod(
    order: Order,
  ): Promise<{ id: string; name: string } | null> {
    if (!order.shippingMethodId) return null;
    const method = await this.prisma.shippingMethod.findUnique({
      where: { id: order.shippingMethodId },
      select: { id: true, name: true, requiresPickupPoint: true },
    });
    if (!method?.requiresPickupPoint) return null;
    return { id: method.id, name: method.name };
  }

  // ── Transition draft → awaiting_payment ───────────────────────────────

  async readyForPayment(
    orderId: string,
  ): Promise<{ orderId: string; orderNumber: string; totalCents: number }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Test products are refused here — before the status transition and
    // before any future Stripe call. The customer sees a generic failure
    // and the payment form never loads.
    await this.testCheckoutGuard.assertCheckoutAllowed(order);

    // Idempotent resume: a page refresh re-runs the checkout flow against
    // the same draft/awaiting_payment order (see initiate()'s idempotency check).
    if (order.status === 'awaiting_payment') {
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
      };
    }
    if (order.status !== 'draft')
      throw new BadRequestException('Order is not in draft state');

    if (!order.shippingMethodId) {
      const ctx = await this.resolveShippingContext(
        await this.orderProductIds(orderId),
        order.pricingSnapshot,
      );
      if (!ctx.freeShipping)
        throw new BadRequestException(
          'Please select a shipping method before payment',
        );
    }

    // Last server-side gate before the order can be paid for: a pickup-point
    // method must have a point, and that point is re-read from the carrier
    // rather than trusted from storage — it may have closed, or the customer
    // may have changed country since choosing it.
    if (await this.selectedPickupPointMethod(order)) {
      const revalidated = await this.pickupPoints.revalidateSnapshot(
        orderId,
        order.pickupPointSnapshot,
      );
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          pickupPointSnapshot: revalidated as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'awaiting_payment' },
    });
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: 'draft',
        toStatus: 'awaiting_payment',
        note: 'Customer proceeded to payment',
      },
    });

    // NOTE: the cart is intentionally left "active" here — it's only marked
    // "completed" once payment is confirmed (OrdersService.confirmPayment).
    // This keeps the customer's cart items intact if payment fails, is
    // abandoned, or the page is refreshed mid-payment.

    await this.customerService.upsertFromOrder(
      order.customerEmail,
      order.customerName ?? null,
      order.customerPhone ?? null,
      order.userId ?? null,
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
    };
  }

  // ── Get snapshot for an existing order ─────────────────────────────────

  async getSnapshot(orderId: string): Promise<CheckoutSnapshot> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toSnapshot(order);
  }

  // ── Coupon preview (checkout address step) ─────────────────────────────

  async validateCoupon(code: string, cartToken: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { token: cartToken, status: 'active' },
      include: { items: true },
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    const lines = await this.buildLineItems(cart.items);
    return this.pricingEngine.validateCoupon(code, lines);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async buildLineItems(
    items: Pick<
      CartItem,
      'productId' | 'variantId' | 'quantity' | 'unitPriceCents'
    >[],
  ): Promise<LineItemInput[]> {
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, categories: { select: { id: true } } },
        })
      : [];
    const categoryIdsByProduct = new Map(
      products.map((p) => [p.id, p.categories.map((c) => c.id)]),
    );

    return items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      categoryIds: categoryIdsByProduct.get(item.productId) ?? [],
    }));
  }

  private async computePricing(
    items: Pick<
      CartItem,
      'productId' | 'variantId' | 'quantity' | 'unitPriceCents'
    >[],
    couponCode: string | null | undefined,
  ): Promise<PricingResult> {
    const lines = await this.buildLineItems(items);
    return this.pricingEngine.compute(lines, couponCode ?? null);
  }

  private buildAddressSnapshot(dto: InitiateCheckoutDto) {
    return {
      name:
        `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() ||
        dto.companyName?.trim() ||
        '',
      line1: dto.line1,
      line2: dto.line2 ?? '',
      city: dto.city,
      zip: dto.zip,
      country: dto.country,
    };
  }

  private async orderProductIds(orderId: string): Promise<string[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true },
    });
    return [
      ...new Set(items.map((i) => i.productId).filter(Boolean) as string[]),
    ];
  }

  /**
   * All-or-nothing at the product level: free only when every distinct
   * product in the basket carries Product.freeShipping. That signal is then
   * OR-ed with the promotions/coupon engine's own freeShipping result (from
   * the order's stored pricingSnapshot) — either source alone is enough to
   * make the whole order ship free. Upgrade-method ids are unioned from both
   * sources (today the pricing engine never contributes any, since
   * promotions carry no upgrade-method configuration — see
   * PricingResult.freeShippingUpgradeMethodIds).
   */
  private async resolveShippingContext(
    productIds: string[],
    pricingSnapshot?: Prisma.JsonValue | null,
  ): Promise<ShippingContext> {
    const promo = pricingSnapshot as unknown as
      PricingResult | null | undefined;
    const promoFreeShipping = promo?.freeShipping === true;
    const promoUpgradeIds = promo?.freeShippingUpgradeMethodIds ?? [];

    let productFreeShipping = false;
    let productUpgradeIds: string[] = [];
    let freeDaysMin: number | null = null;
    let freeDaysMax: number | null = null;

    if (productIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          freeShipping: true,
          freeShippingDaysMin: true,
          freeShippingDaysMax: true,
          freeShippingUpgradeMethods: { select: { id: true } },
        },
      });
      if (products.length && products.every((p) => p.freeShipping)) {
        productFreeShipping = true;
        productUpgradeIds = [
          ...new Set(
            products.flatMap((p) =>
              p.freeShippingUpgradeMethods.map((m) => m.id),
            ),
          ),
        ];
        const mins = products
          .map((p) => p.freeShippingDaysMin)
          .filter((v): v is number => v !== null);
        const maxs = products
          .map((p) => p.freeShippingDaysMax)
          .filter((v): v is number => v !== null);
        freeDaysMin = mins.length ? Math.min(...mins) : null;
        freeDaysMax = maxs.length ? Math.max(...maxs) : null;
      }
    }

    const freeShipping = productFreeShipping || promoFreeShipping;
    if (!freeShipping)
      return {
        freeShipping: false,
        upgradeMethodIds: [],
        freeDaysMin: null,
        freeDaysMax: null,
      };

    return {
      freeShipping: true,
      upgradeMethodIds: [
        ...new Set([...productUpgradeIds, ...promoUpgradeIds]),
      ],
      freeDaysMin,
      freeDaysMax,
    };
  }

  private async toSnapshot(order: Order): Promise<CheckoutSnapshot> {
    const address = order.shippingAddressSnapshot as {
      country?: string;
    } | null;
    const country = address?.country;

    const productIds = await this.orderProductIds(order.id);
    const ctx = await this.resolveShippingContext(
      productIds,
      order.pricingSnapshot,
    );
    const quote = country
      ? await this.shipping.getMethodsForCountry(
          country,
          order.subtotalCents,
          order.customerLocale,
          {
            forceFree: ctx.freeShipping,
            upgradeMethodIds: ctx.upgradeMethodIds,
            freeDaysMin: ctx.freeDaysMin,
            freeDaysMax: ctx.freeDaysMax,
            productIds,
          },
        )
      : { zone: null, methods: [] };

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      discountCents: order.discountCents,
      categoryDiscountCents: order.categoryDiscountCents,
      couponCode: order.couponCode,
      totalCents: order.totalCents,
      freeShipping: ctx.freeShipping,
      shippingMethodId: order.shippingMethodId,
      shippingMethods: quote.methods,
      pickupPoint:
        (order.pickupPointSnapshot as unknown as PickupPointSnapshot | null) ??
        null,
      reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
      trackingToken: order.trackingToken ?? null,
    };
  }
}
