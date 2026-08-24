import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { TranslationsService } from '../translations/translations.service';
import { BehaviorTrackingService } from '../analytics-tracking/behavior-tracking.service';
import {
  resolveUnitPriceForQuantity,
  sumOptionAdjustments,
} from '../pricing/variant-price.util';
import { Cart, CartItem } from '../../generated/prisma/client';
import {
  CART_ABANDONMENT_QUEUE,
  CartAbandonmentJobData,
} from './cart-abandonment.constants';
import { MetaCapiService } from '../marketing/meta-capi/meta-capi.service';
import { TikTokEventsService } from '../marketing/tiktok-events/tiktok-events.service';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string;
}

const ET_SHOP_PRODUCT = 'shop_product';
const ET_VARIANT_ATTR = 'shop_variant_attribute';
const ET_VARIATION_OPTION = 'shop_variation_option_value';

const ABANDONMENT_DELAY_MS = 60 * 60 * 1000; // 1 hour

interface OptionSnapshot {
  attributeId: string;
  attributeName: string;
  optionValueId: string | null;
  value: string;
  displayValue: string | null;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly translations: TranslationsService,
    private readonly behaviorTracking: BehaviorTrackingService,
    private readonly metaCapi: MetaCapiService,
    private readonly tiktokEvents: TikTokEventsService,
    @InjectQueue(CART_ABANDONMENT_QUEUE)
    private readonly abandonmentQueue: Queue<CartAbandonmentJobData>,
  ) {}

  // ── Get or create cart by token ──────────────────────────────────────
  // Read-only: never persists a row. A visitor merely loading the shop must
  // not create DB rows — a real Cart row is only ever written the first
  // time an item is actually added, in getOrCreatePersistedCart() below.

  async getOrCreate(token: string, userId?: string, lang?: string) {
    const existing = await this.prisma.cart.findUnique({
      where: { token },
      include: { items: true },
    });

    if (existing && existing.status === 'active') {
      if (userId && !existing.userId) {
        await this.prisma.cart.update({
          where: { id: existing.id },
          data: { userId },
        });
        existing.userId = userId;
      }
      return this.enrichCart(existing, lang);
    }

    // No active cart persisted for this token yet — either it never existed,
    // or the existing one is no longer active (completed/abandoned/merged)
    // and needs a fresh token so the frontend can reset its state. Return a
    // virtual, unsaved empty cart rather than writing a row.
    const virtualCart = {
      id: null,
      token: existing ? randomUUID() : token,
      userId: userId ?? null,
      status: 'active',
      expiresAt: null,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Cart & { items: CartItem[] };

    return this.enrichCart(virtualCart, lang);
  }

  // ── Add item ─────────────────────────────────────────────────────────

  async addItem(
    token: string,
    variantId: string,
    quantity: number,
    selectedOptionValueIds?: string[],
    lang?: string,
    meta?: RequestMeta,
  ) {
    if (quantity < 1)
      throw new BadRequestException('Quantity must be at least 1');

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: true,
        options: { include: { attribute: true, optionValue: true } },
      },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    if (variant.product.status !== 'active')
      throw new BadRequestException('Product is not available');

    const inventory = await this.prisma.inventoryItem.findUnique({
      where: { variantId },
    });
    if (!inventory || inventory.available < quantity) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_STOCK',
        available: inventory?.available ?? 0,
      });
    }

    const cart = await this.getOrCreatePersistedCart(token);
    const product = variant.product;

    // Shared with the matching browser-side pixel calls (fbq/ttq) for Meta
    // and TikTok's own dedup between their client and server events.
    const metaEventId = randomUUID();
    const tiktokEventId = randomUUID();
    let trackUnitPriceCents = 0;

    const existing = cart.items.find((i) => i.variantId === variantId);
    if (existing) {
      const newQty = existing.quantity + quantity;
      if (inventory.available < newQty) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          available: inventory.available,
        });
      }
      // Re-resolve at the new total quantity — a line already past an
      // upsell threshold, or one that just crossed it, must reflect the
      // tier price for its new quantity.
      const unitPriceCents = resolveUnitPriceForQuantity(
        {
          variantPriceCents: variant.priceCents,
          basePriceCents: product.basePriceCents,
          optionAdjustmentCents: sumOptionAdjustments(variant.options),
        },
        newQty,
        {
          upsellingEnabled: product.upsellingEnabled,
          upsellTiers: product.upsellTiers as never,
        },
      );
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty, unitPriceCents },
      });
      trackUnitPriceCents = unitPriceCents;
    } else {
      // Build options snapshot. Priority: caller-supplied IDs (user manually
      // picked options) → variant's own option relations (default variant
      // added directly from a listing).
      let optionsSnapshot: OptionSnapshot[] | null = null;

      if (selectedOptionValueIds?.length) {
        const ovRows = await this.prisma.variationOptionValue.findMany({
          where: { id: { in: selectedOptionValueIds } },
          include: { attribute: true },
        });
        optionsSnapshot = ovRows.map((ov) => ({
          attributeId: ov.attributeId,
          attributeName: ov.attribute.name,
          optionValueId: ov.id,
          value: ov.value,
          displayValue: ov.displayValue,
        }));
      } else if (variant.options.length) {
        optionsSnapshot = variant.options.map((o) => ({
          attributeId: o.attributeId,
          attributeName: o.attribute.name,
          optionValueId: o.optionValueId,
          value: o.value,
          displayValue: o.optionValue?.displayValue ?? null,
        }));
      }

      const unitPriceCents = resolveUnitPriceForQuantity(
        {
          variantPriceCents: variant.priceCents,
          basePriceCents: product.basePriceCents,
          optionAdjustmentCents: sumOptionAdjustments(variant.options),
        },
        quantity,
        {
          upsellingEnabled: product.upsellingEnabled,
          upsellTiers: product.upsellTiers as never,
        },
      );

      // Image priority mirrors the PDP hero: the variant's own featured
      // media, then the picked option value's per-product image override
      // (e.g. Color=Red's photo), then the product's generic featured image.
      let imageKeySnapshot: string | null = variant.featuredMediaKey ?? null;
      if (!imageKeySnapshot && optionsSnapshot?.length) {
        const optionValueIds = optionsSnapshot
          .map((o) => o.optionValueId)
          .filter(Boolean) as string[];
        if (optionValueIds.length) {
          const optionImage =
            await this.prisma.productOptionValueImage.findFirst({
              where: {
                productId: product.id,
                optionValueId: { in: optionValueIds },
              },
            });
          imageKeySnapshot = optionImage?.mediaKey ?? null;
        }
      }
      imageKeySnapshot = imageKeySnapshot ?? product.featuredImageKey ?? null;

      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant.id,
          quantity,
          unitPriceCents,
          titleSnapshot: product.title,
          skuSnapshot: variant.sku,
          imageKeySnapshot,
          optionsSnapshot: optionsSnapshot as never,
          compareAtPriceCentsSnapshot: variant.compareAtPriceCents ?? null,
        },
      });
      trackUnitPriceCents = unitPriceCents;
    }

    // Schedule (or reschedule) an abandonment reminder for this cart. The
    // deterministic jobId means BullMQ dedupes automatically — only one
    // pending job per cart token, so it's safe to call on every add-item.
    await this.abandonmentQueue.add(
      'abandon',
      { cartToken: token },
      {
        delay: ABANDONMENT_DELAY_MS,
        jobId: `cart-abandon.${token}`,
        removeOnComplete: true,
      },
    );

    await this.behaviorTracking.record({
      eventType: 'add_to_cart',
      cartToken: token,
      productId: product.id,
      quantity,
      clientIp: meta?.ip,
      userAgent: meta?.userAgent,
    });

    // Meta Pixel / TikTok: value/currency/ids only — never customer PII.
    // Value reflects what was just added (unit price × quantity added), not
    // the cart line's accumulated total, matching each platform's AddToCart
    // convention. Sent independently — a customer may run either or both ad
    // platforms.
    await this.metaCapi.sendEvent({
      eventName: 'AddToCart',
      eventId: metaEventId,
      eventSourceUrl: `${process.env.APP_URL ?? ''}/shop`,
      customData: {
        content_type: 'product',
        content_ids: [variantId],
        value: (trackUnitPriceCents * quantity) / 100,
        currency: 'EUR',
        num_items: quantity,
      },
      clientIpAddress: meta?.ip ?? null,
      clientUserAgent: meta?.userAgent ?? null,
    });

    // `contents` is a nested array per TikTok's own event spec, not a flat content_id.
    await this.tiktokEvents.sendEvent({
      eventName: 'AddToCart',
      eventId: tiktokEventId,
      eventSourceUrl: `${process.env.APP_URL ?? ''}/shop`,
      properties: {
        contents: [
          {
            content_id: variantId,
            content_type: 'product',
            content_name: product.title,
            quantity,
            price: trackUnitPriceCents / 100,
          },
        ],
        value: (trackUnitPriceCents * quantity) / 100,
        currency: 'EUR',
      },
      clientIpAddress: meta?.ip ?? null,
      clientUserAgent: meta?.userAgent ?? null,
    });

    const cartData = await this.getOrCreate(token, undefined, lang);
    return {
      ...cartData,
      metaAddToCartEventId: metaEventId,
      tiktokAddToCartEventId: tiktokEventId,
    };
  }

  // ── Update item quantity ─────────────────────────────────────────────

  async updateItem(
    token: string,
    itemId: string,
    quantity: number,
    lang?: string,
    meta?: RequestMeta,
  ) {
    if (quantity < 1) return this.removeItem(token, itemId, lang, meta);

    const cart = await this.ensureActiveCart(token);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');

    const inventory = await this.prisma.inventoryItem.findUnique({
      where: { variantId: item.variantId },
    });
    if (!inventory || inventory.available < quantity) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_STOCK',
        available: inventory?.available ?? 0,
      });
    }

    // Re-resolve price for the new quantity — quantity tiers mean bumping
    // quantity from the upselling UI must re-apply the matching tier price.
    const [variant, product] = await Promise.all([
      this.prisma.productVariant.findUnique({
        where: { id: item.variantId },
        include: { options: { include: { optionValue: true } } },
      }),
      this.prisma.product.findUnique({ where: { id: item.productId } }),
    ]);
    if (!variant || !product) {
      throw new BadRequestException(
        'This item is no longer available. Please remove it from your cart.',
      );
    }

    const unitPriceCents = resolveUnitPriceForQuantity(
      {
        variantPriceCents: variant.priceCents,
        basePriceCents: product.basePriceCents,
        optionAdjustmentCents: sumOptionAdjustments(variant.options),
      },
      quantity,
      {
        upsellingEnabled: product.upsellingEnabled,
        upsellTiers: product.upsellTiers as never,
      },
    );
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity, unitPriceCents },
    });
    await this.behaviorTracking.record({
      eventType: 'update_cart_item',
      cartToken: token,
      productId: item.productId,
      quantity,
      clientIp: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return this.getOrCreate(token, undefined, lang);
  }

  // ── Remove item ──────────────────────────────────────────────────────

  async removeItem(
    token: string,
    itemId: string,
    lang?: string,
    meta?: RequestMeta,
  ) {
    const cart = await this.ensureActiveCart(token);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    await this.behaviorTracking.record({
      eventType: 'remove_from_cart',
      cartToken: token,
      productId: item.productId,
      quantity: item.quantity,
      clientIp: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return this.getOrCreate(token, undefined, lang);
  }

  // ── Mark completed (called when order is created) ───────────────────

  async markCompleted(token: string): Promise<void> {
    await this.prisma.cart.updateMany({
      where: { token },
      data: { status: 'completed' },
    });
    // Cancel the pending abandonment reminder — the cart isn't abandoned anymore.
    const job = await this.abandonmentQueue.getJob(`cart-abandon.${token}`);
    if (job) await job.remove();
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  private async ensureActiveCart(
    token: string,
  ): Promise<Cart & { items: CartItem[] }> {
    const cart = await this.prisma.cart.findFirst({
      where: { token, status: 'active' },
      include: { items: true },
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    return cart;
  }

  // The one place a Cart row is ever persisted — the first real mutation
  // (adding an item) for a given token, not a bare page-view GET.
  private async getOrCreatePersistedCart(
    token: string,
  ): Promise<Cart & { items: CartItem[] }> {
    const existing = await this.prisma.cart.findUnique({
      where: { token },
      include: { items: true },
    });

    if (existing) {
      // Same behavior as ensureActiveCart() for a non-active row at this
      // token: the frontend must fetch a fresh token via GET first (the
      // unique index means we can't silently reuse this token for a new row).
      if (existing.status !== 'active')
        throw new NotFoundException('Active cart not found');
      return existing;
    }

    const cart = await this.prisma.cart.create({
      data: { token, status: 'active' },
    });
    return { ...cart, items: [] };
  }

  private async enrichCart(cart: Cart & { items: CartItem[] }, lang?: string) {
    const items = cart.items ?? [];
    const imageKeys = items
      .map((i) => i.imageKeySnapshot)
      .filter(Boolean) as string[];
    const urlMap = await this.assetUrls.resolveBatch(imageKeys);

    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
        })
      : [];
    const slugMap = new Map(products.map((p) => [p.id, p.slug]));
    const freeShipMap = new Map(products.map((p) => [p.id, p.freeShipping]));

    let enrichedItems = items.map((item) => ({
      ...item,
      imageUrl: item.imageKeySnapshot
        ? (urlMap.get(item.imageKeySnapshot) ?? null)
        : null,
      lineTotalCents: item.quantity * item.unitPriceCents,
      productSlug: slugMap.get(item.productId) ?? null,
      freeShipping: freeShipMap.get(item.productId) ?? false,
    }));

    // Translate optionsSnapshot attribute names / display values, and the
    // frozen titleSnapshot, for non-base locales.
    if (lang) {
      const snapshots = enrichedItems.map(
        (i) => (i.optionsSnapshot as unknown as OptionSnapshot[] | null) ?? [],
      );
      const uniqueAttrIds = [
        ...new Set(
          snapshots.flatMap((s) => s.map((o) => o.attributeId).filter(Boolean)),
        ),
      ];
      const uniqueOptionIds = [
        ...new Set(
          snapshots.flatMap(
            (s) => s.map((o) => o.optionValueId).filter(Boolean) as string[],
          ),
        ),
      ];

      const [attrTranslated, optionTranslated, productTitleTranslated] =
        await Promise.all([
          uniqueAttrIds.length
            ? this.translations.applyToEntities(
                uniqueAttrIds.map((id) => ({ id })),
                ET_VARIANT_ATTR,
                lang,
              )
            : Promise.resolve([]),
          uniqueOptionIds.length
            ? this.translations.applyToEntities(
                uniqueOptionIds.map((id) => ({ id })),
                ET_VARIATION_OPTION,
                lang,
              )
            : Promise.resolve([]),
          productIds.length
            ? this.translations.applyToEntities(
                productIds.map((id) => ({ id })),
                ET_SHOP_PRODUCT,
                lang,
              )
            : Promise.resolve([]),
        ]);

      const attrMap = new Map(
        attrTranslated.map((r: Record<string, unknown>) => [r.id, r]),
      );
      const optionMap = new Map(
        optionTranslated.map((r: Record<string, unknown>) => [r.id, r]),
      );
      const titleMap = new Map(
        productTitleTranslated.map((r: Record<string, unknown>) => [
          r.id,
          r.title,
        ]),
      );

      enrichedItems = enrichedItems.map((item) => ({
        ...item,
        titleSnapshot:
          (titleMap.get(item.productId) as string | undefined) ??
          item.titleSnapshot,
        optionsSnapshot: (
          (item.optionsSnapshot as unknown as OptionSnapshot[] | null) ?? []
        ).map((o) => ({
          ...o,
          attributeName:
            (attrMap.get(o.attributeId) as Record<string, unknown> | undefined)
              ?.name ?? o.attributeName,
          displayValue: o.optionValueId
            ? ((
                optionMap.get(o.optionValueId) as
                  Record<string, unknown> | undefined
              )?.displayValue ?? o.displayValue)
            : o.displayValue,
        })) as never,
      }));
    }

    const subtotalCents = enrichedItems.reduce(
      (sum, i) => sum + i.lineTotalCents,
      0,
    );

    return {
      ...cart,
      items: enrichedItems,
      subtotalCents,
      itemCount: enrichedItems.reduce((sum, i) => sum + i.quantity, 0),
      // All-or-nothing: shipping is charged once per order, so the basket
      // only ships free when every item carries free shipping.
      freeShipping:
        enrichedItems.length > 0 &&
        enrichedItems.every((i) => i.freeShipping === true),
    };
  }
}
