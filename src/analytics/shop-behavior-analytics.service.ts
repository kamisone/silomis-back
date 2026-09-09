import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, OrderStatus, ProductStatus } from '../../generated/prisma/client';
import { ConversionFilter, DateWindow, TestProductFilter } from './analytics-filters';

const PAID_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

/**
 * Keeps demand-validation products out of the ordinary conversion reports.
 *
 * Test products cannot be bought — checkout is refused — so their views and
 * cart adds would depress every conversion rate against purchases that can
 * never happen. They have their own report (`getTestProductDemand`).
 *
 * NOT EXISTS rather than a join, so cart-level events with a NULL productId are
 * kept: they belong to the funnel regardless of which product they came from.
 */
const EXCLUDE_TEST_PRODUCTS = Prisma.sql`NOT EXISTS (SELECT 1 FROM shop_products tp WHERE tp.id = be."productId" AND tp."isTestProduct" = true)`;

/**
 * Counts unique visitors. `visitorHash` is a salted digest of the client IP
 * (see GeoIpService), so the same person viewing the same product repeatedly
 * counts once. Grouped queries already scope by product, so distinct hashes
 * within a group means distinct IPs for that product.
 */
const VISITOR_KEY_COUNT = Prisma.sql`COUNT(DISTINCT COALESCE(be."visitorHash", be."cartToken", be.id::text))`;

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export interface TimelineEntry {
  type: string;
  date: Date;
  productId: string | null;
  productTitle: string | null;
  searchQuery: string | null;
  resultCount: number | null;
  quantity: number | null;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  totalCents: number | null;
}

/**
 * Funnel / conversion / demand-validation reporting on top of ShopBehaviorEvent
 * (raw event capture) and shop_orders (purchases). Mirrors vitecamio's
 * commerce/analytics/shop-behavior-analytics.service.ts.
 */
@Injectable()
export class ShopBehaviorAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a country filter to a concrete list of ISO codes, or null when no
   * country scope is applied. A `continent` expands to every country in it.
   * An empty array means "scoped, but nothing matches".
   */
  private async countryCodesFor(f: ConversionFilter): Promise<string[] | null> {
    if (f.countryCode) return [f.countryCode];
    if (f.continent) {
      const rows = await this.prisma.country.findMany({ where: { continentCode: f.continent }, select: { isoCode: true } });
      return rows.map((r) => r.isoCode);
    }
    return null;
  }

  // ── Conversion funnel ───────────────────────────────────────────────────

  async getConversionFunnel(
    window: DateWindow,
    filter: ConversionFilter = {},
  ): Promise<{
    days: number;
    views: number;
    addsToCart: number;
    checkoutsStarted: number;
    purchases: number;
    viewToCartRatePct: number;
    cartToCheckoutRatePct: number;
    checkoutToPurchaseRatePct: number;
    overallConversionRatePct: number;
  }> {
    const { since, until, days } = window;
    const zero = { days, views: 0, addsToCart: 0, checkoutsStarted: 0, purchases: 0, viewToCartRatePct: 0, cartToCheckoutRatePct: 0, checkoutToPurchaseRatePct: 0, overallConversionRatePct: 0 };

    const codes = await this.countryCodesFor(filter);
    if (codes && codes.length === 0) return zero;

    const counts = await this.prisma.$queryRaw<Array<{ eventType: string; count: bigint; distinctCarts: bigint }>>`
      SELECT be."eventType" AS "eventType", COUNT(be.id)::bigint AS count, ${VISITOR_KEY_COUNT}::bigint AS "distinctCarts"
      FROM shop_behavior_events be
      WHERE be."eventType" IN ('product_view', 'add_to_cart', 'checkout_started')
        AND be."createdAt" >= ${since}
        AND be."createdAt" < ${until}
        AND ${EXCLUDE_TEST_PRODUCTS}
        ${codes ? Prisma.sql`AND be."countryCode" IN (${Prisma.join(codes)})` : Prisma.empty}
        ${filter.productId ? Prisma.sql`AND be."productId" = ${filter.productId}` : Prisma.empty}
      GROUP BY be."eventType"
    `;

    const cartsByType = new Map(counts.map((r) => [r.eventType, Number(r.distinctCarts)]));
    const views = cartsByType.get('product_view') ?? 0;
    const addsToCart = cartsByType.get('add_to_cart') ?? 0;
    const checkoutsStarted = cartsByType.get('checkout_started') ?? 0;

    let purchases: number;
    if (filter.productId) {
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT o.id)::bigint AS count
        FROM shop_orders o
        JOIN shop_order_items i ON i."orderId" = o.id
        WHERE o.status::text IN (${Prisma.join(PAID_STATUSES)})
          AND o."createdAt" >= ${since}
          AND o."createdAt" < ${until}
          AND i."productId" = ${filter.productId}
          ${codes ? Prisma.sql`AND o."shippingAddressSnapshot"->>'country' IN (${Prisma.join(codes)})` : Prisma.empty}
      `;
      purchases = Number(rows[0]?.count ?? 0);
    } else {
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM shop_orders o
        WHERE o.status::text IN (${Prisma.join(PAID_STATUSES)})
          AND o."createdAt" >= ${since}
          AND o."createdAt" < ${until}
          ${codes ? Prisma.sql`AND o."shippingAddressSnapshot"->>'country' IN (${Prisma.join(codes)})` : Prisma.empty}
      `;
      purchases = Number(rows[0]?.count ?? 0);
    }

    return {
      days,
      views,
      addsToCart,
      checkoutsStarted,
      purchases,
      viewToCartRatePct: pct(addsToCart, views),
      cartToCheckoutRatePct: pct(checkoutsStarted, addsToCart),
      checkoutToPurchaseRatePct: pct(purchases, checkoutsStarted),
      overallConversionRatePct: pct(purchases, views),
    };
  }

  // ── Test-product demand validation ──────────────────────────────────────

  /**
   * Per-test-product demand report.
   *
   * - `reachedShipping` — submitted the address form and landed on the shipping
   *   step (`checkout_started`, one per distinct cart).
   * - `reachedCheckout` — selected shipping and clicked through to payment,
   *   the furthest a test product can be taken before checkout is refused
   *   (`test_checkout_blocked`, recorded server-side at the block).
   *
   * Every test product is listed even with zero activity, so a product that
   * simply is not selling is visible rather than silently absent.
   */
  async getTestProductDemand(
    window: DateWindow,
    filter: TestProductFilter = {},
  ): Promise<
    Array<{
      productId: string;
      title: string;
      slug: string;
      status: string;
      views: number;
      addsToCart: number;
      reachedShipping: number;
      reachedCheckout: number;
      viewToCartRatePct: number;
      cartToShippingRatePct: number;
      cartToCheckoutRatePct: number;
      viewToCheckoutRatePct: number;
    }>
  > {
    const codes = await this.countryCodesFor(filter);
    if (codes && codes.length === 0) return [];

    const where: Prisma.ProductWhereInput = {
      isTestProduct: true,
      ...(filter.productId ? { id: filter.productId } : {}),
      ...(filter.productStatus ? { status: filter.productStatus as ProductStatus } : {}),
      ...(filter.brand ? { brand: filter.brand } : {}),
      ...(filter.minPriceCents !== undefined ? { basePriceCents: { gte: filter.minPriceCents } } : {}),
      ...(filter.maxPriceCents !== undefined ? { basePriceCents: { lte: filter.maxPriceCents } } : {}),
      ...(filter.search ? { title: { contains: filter.search, mode: 'insensitive' } } : {}),
      ...(filter.categoryId ? { categories: { some: { id: filter.categoryId } } } : {}),
    };
    const testProducts = await this.prisma.product.findMany({ where, select: { id: true, title: true, slug: true, status: true } });
    if (!testProducts.length) return [];

    const { since, until } = window;
    const ids = testProducts.map((p) => p.id);

    const rows = await this.prisma.$queryRaw<Array<{ productId: string; eventType: string; count: bigint; distinctCarts: bigint }>>`
      SELECT be."productId" AS "productId", be."eventType" AS "eventType", COUNT(be.id)::bigint AS count, ${VISITOR_KEY_COUNT}::bigint AS "distinctCarts"
      FROM shop_behavior_events be
      WHERE be."productId" IN (${Prisma.join(ids)})
        AND be."eventType" IN ('product_view', 'add_to_cart', 'checkout_started', 'test_checkout_blocked')
        AND be."createdAt" >= ${since}
        AND be."createdAt" < ${until}
        ${codes ? Prisma.sql`AND be."countryCode" IN (${Prisma.join(codes)})` : Prisma.empty}
      GROUP BY be."productId", be."eventType"
    `;

    const distinct = new Map<string, number>();
    for (const r of rows) distinct.set(`${r.productId}:${r.eventType}`, Number(r.distinctCarts));

    let result = testProducts.map((p) => {
      const views = distinct.get(`${p.id}:product_view`) ?? 0;
      const addsToCart = distinct.get(`${p.id}:add_to_cart`) ?? 0;
      const reachedShipping = distinct.get(`${p.id}:checkout_started`) ?? 0;
      const reachedCheckout = distinct.get(`${p.id}:test_checkout_blocked`) ?? 0;
      return {
        productId: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status as string,
        views,
        addsToCart,
        reachedShipping,
        reachedCheckout,
        viewToCartRatePct: pct(addsToCart, views),
        cartToShippingRatePct: pct(reachedShipping, addsToCart),
        cartToCheckoutRatePct: pct(reachedCheckout, addsToCart),
        viewToCheckoutRatePct: pct(reachedCheckout, views),
      };
    });

    if (filter.activeOnly) result = result.filter((r) => r.views > 0 || r.addsToCart > 0 || r.reachedShipping > 0 || r.reachedCheckout > 0);
    if (filter.reachedCheckoutOnly) result = result.filter((r) => r.reachedCheckout > 0);
    if (filter.minViews !== undefined) result = result.filter((r) => r.views >= filter.minViews!);

    const sortKey = filter.sort;
    const dir = filter.order === 'asc' ? 1 : -1;
    if (sortKey) {
      result.sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
    } else {
      result.sort((a, b) => b.reachedCheckout - a.reachedCheckout || b.views - a.views);
    }

    return filter.limit !== undefined ? result.slice(0, filter.limit) : result;
  }

  // ── Per-product conversion (real catalogue only) ─────────────────────────

  async getProductConversion(
    window: DateWindow,
    limit = 20,
    filter: ConversionFilter = {},
  ): Promise<Array<{ productId: string; title: string; slug: string; views: number; addsToCart: number; purchases: number; conversionRatePct: number }>> {
    const { since, until } = window;
    const codes = await this.countryCodesFor(filter);
    if (codes && codes.length === 0) return [];

    const [viewRows, addRows, purchaseRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ productId: string; count: bigint }>>`
        SELECT be."productId" AS "productId", COUNT(be.id)::bigint AS count
        FROM shop_behavior_events be
        WHERE be."eventType" = 'product_view' AND be."createdAt" >= ${since} AND be."createdAt" < ${until}
          AND be."productId" IS NOT NULL AND ${EXCLUDE_TEST_PRODUCTS}
          ${codes ? Prisma.sql`AND be."countryCode" IN (${Prisma.join(codes)})` : Prisma.empty}
          ${filter.productId ? Prisma.sql`AND be."productId" = ${filter.productId}` : Prisma.empty}
        GROUP BY be."productId"
      `,
      this.prisma.$queryRaw<Array<{ productId: string; count: bigint }>>`
        SELECT be."productId" AS "productId", COUNT(be.id)::bigint AS count
        FROM shop_behavior_events be
        WHERE be."eventType" = 'add_to_cart' AND be."createdAt" >= ${since} AND be."createdAt" < ${until}
          AND be."productId" IS NOT NULL AND ${EXCLUDE_TEST_PRODUCTS}
          ${codes ? Prisma.sql`AND be."countryCode" IN (${Prisma.join(codes)})` : Prisma.empty}
          ${filter.productId ? Prisma.sql`AND be."productId" = ${filter.productId}` : Prisma.empty}
        GROUP BY be."productId"
      `,
      this.prisma.$queryRaw<Array<{ productId: string; count: bigint }>>`
        SELECT i."productId" AS "productId", SUM(i.quantity)::bigint AS count
        FROM shop_orders o
        JOIN shop_order_items i ON i."orderId" = o.id
        WHERE o.status::text IN (${Prisma.join(PAID_STATUSES)}) AND o."createdAt" >= ${since} AND o."createdAt" < ${until}
          AND i."productId" IS NOT NULL
          ${codes ? Prisma.sql`AND o."shippingAddressSnapshot"->>'country' IN (${Prisma.join(codes)})` : Prisma.empty}
          ${filter.productId ? Prisma.sql`AND i."productId" = ${filter.productId}` : Prisma.empty}
        GROUP BY i."productId"
      `,
    ]);

    const viewMap = new Map(viewRows.map((r) => [r.productId, Number(r.count)]));
    const addMap = new Map(addRows.map((r) => [r.productId, Number(r.count)]));
    const purchaseMap = new Map(purchaseRows.map((r) => [r.productId, Number(r.count)]));

    const productIds = [...new Set([...viewMap.keys(), ...addMap.keys(), ...purchaseMap.keys()])];
    if (!productIds.length) return [];

    // The purchases side reads from orders, not `be`, so EXCLUDE_TEST_PRODUCTS
    // cannot reach it — drop test products here as well.
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, isTestProduct: false }, select: { id: true, title: true, slug: true } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const rows = productIds.flatMap((productId) => {
      const product = productMap.get(productId);
      if (!product) return [];
      const views = viewMap.get(productId) ?? 0;
      const addsToCart = addMap.get(productId) ?? 0;
      const purchases = purchaseMap.get(productId) ?? 0;
      return [{ productId, title: product.title, slug: product.slug, views, addsToCart, purchases, conversionRatePct: pct(purchases, views) }];
    });

    return rows.sort((a, b) => b.views - a.views).slice(0, limit);
  }

  /**
   * Views/adds-to-cart come from ShopBehaviorEvent.countryCode (resolved from
   * the request IP via GeoIpService at write time). Purchases use the country
   * already captured on the order's shipping address at checkout.
   */
  async getCountryBreakdown(window: DateWindow, limit = 20, filter: ConversionFilter = {}): Promise<Array<{ countryCode: string; countryName: string; views: number; addsToCart: number; purchases: number }>> {
    const { since, until } = window;
    const pid = filter.productId;

    const [viewRows, addRows, purchaseRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ countryCode: string; count: bigint }>>`
        SELECT be."countryCode" AS "countryCode", COUNT(be.id)::bigint AS count
        FROM shop_behavior_events be
        WHERE be."eventType" = 'product_view' AND be."createdAt" >= ${since} AND be."createdAt" < ${until}
          AND be."countryCode" IS NOT NULL AND ${EXCLUDE_TEST_PRODUCTS}
          ${pid ? Prisma.sql`AND be."productId" = ${pid}` : Prisma.empty}
        GROUP BY be."countryCode"
      `,
      this.prisma.$queryRaw<Array<{ countryCode: string; count: bigint }>>`
        SELECT be."countryCode" AS "countryCode", COUNT(be.id)::bigint AS count
        FROM shop_behavior_events be
        WHERE be."eventType" = 'add_to_cart' AND be."createdAt" >= ${since} AND be."createdAt" < ${until}
          AND be."countryCode" IS NOT NULL AND ${EXCLUDE_TEST_PRODUCTS}
          ${pid ? Prisma.sql`AND be."productId" = ${pid}` : Prisma.empty}
        GROUP BY be."countryCode"
      `,
      pid
        ? this.prisma.$queryRaw<Array<{ countryCode: string; count: bigint }>>`
            SELECT o."shippingAddressSnapshot"->>'country' AS "countryCode", COUNT(DISTINCT o.id)::bigint AS count
            FROM shop_orders o
            JOIN shop_order_items i ON i."orderId" = o.id
            WHERE o.status::text IN (${Prisma.join(PAID_STATUSES)}) AND o."createdAt" >= ${since} AND o."createdAt" < ${until}
              AND o."shippingAddressSnapshot"->>'country' IS NOT NULL AND i."productId" = ${pid}
            GROUP BY o."shippingAddressSnapshot"->>'country'
          `
        : this.prisma.$queryRaw<Array<{ countryCode: string; count: bigint }>>`
            SELECT o."shippingAddressSnapshot"->>'country' AS "countryCode", COUNT(o.id)::bigint AS count
            FROM shop_orders o
            WHERE o.status::text IN (${Prisma.join(PAID_STATUSES)}) AND o."createdAt" >= ${since} AND o."createdAt" < ${until}
              AND o."shippingAddressSnapshot"->>'country' IS NOT NULL
            GROUP BY o."shippingAddressSnapshot"->>'country'
          `,
    ]);

    const viewMap = new Map(viewRows.map((r) => [r.countryCode, Number(r.count)]));
    const addMap = new Map(addRows.map((r) => [r.countryCode, Number(r.count)]));
    const purchaseMap = new Map(purchaseRows.map((r) => [r.countryCode, Number(r.count)]));

    const countryCodes = [...new Set([...viewMap.keys(), ...addMap.keys(), ...purchaseMap.keys()])];
    if (!countryCodes.length) return [];

    const countries = await this.prisma.country.findMany({ where: { isoCode: { in: countryCodes } }, select: { isoCode: true, name: true } });
    const nameMap = new Map(countries.map((c) => [c.isoCode, c.name]));

    const rows = countryCodes.map((countryCode) => ({
      countryCode,
      countryName: nameMap.get(countryCode) ?? countryCode,
      views: viewMap.get(countryCode) ?? 0,
      addsToCart: addMap.get(countryCode) ?? 0,
      purchases: purchaseMap.get(countryCode) ?? 0,
    }));

    return rows.sort((a, b) => b.views + b.addsToCart + b.purchases - (a.views + a.addsToCart + a.purchases)).slice(0, limit);
  }

  // ── Drill-down details (for the click-through modals) ────────────────────

  /**
   * Raw behavior events matching a scope, newest first — one row per
   * (visitor, event, product), the same identity the summary columns count,
   * so a visitor refreshing ten times shows one line, not ten.
   */
  async getEventDetails(opts: {
    window: DateWindow;
    eventTypes?: string[];
    filter?: ConversionFilter;
    limit?: number;
    productScope?: 'real' | 'all';
    device?: 'mobile' | 'desktop';
    source?: string;
  }): Promise<
    Array<{
      id: string;
      eventType: string;
      createdAt: Date;
      productId: string | null;
      productTitle: string | null;
      countryCode: string | null;
      countryName: string | null;
      cartToken: string | null;
      quantity: number | null;
      searchQuery: string | null;
      clientIp: string | null;
      device: string | null;
      source: string | null;
    }>
  > {
    const { window, eventTypes, filter = {}, limit = 100, productScope = 'all', device, source } = opts;
    const { since, until } = window;

    const codes = await this.countryCodesFor(filter);
    if (codes && codes.length === 0) return [];

    const events = await this.prisma.$queryRaw<
      Array<{ id: string; eventType: string; createdAt: Date; productId: string | null; countryCode: string | null; cartToken: string | null; quantity: number | null; searchQuery: string | null; clientIp: string | null; device: string | null; source: string | null }>
    >`
      SELECT DISTINCT ON (COALESCE(be."visitorHash", be."cartToken", be.id::text), be."eventType", be."productId")
        be.id, be."eventType" AS "eventType", be."createdAt" AS "createdAt", be."productId" AS "productId",
        be."countryCode" AS "countryCode", be."cartToken" AS "cartToken", be.quantity, be."searchQuery" AS "searchQuery",
        be."clientIp" AS "clientIp", be.device, be.source
      FROM shop_behavior_events be
      WHERE be."createdAt" >= ${since} AND be."createdAt" < ${until}
        ${eventTypes && eventTypes.length ? Prisma.sql`AND be."eventType" IN (${Prisma.join(eventTypes)})` : Prisma.empty}
        ${filter.productId ? Prisma.sql`AND be."productId" = ${filter.productId}` : Prisma.empty}
        ${codes ? Prisma.sql`AND be."countryCode" IN (${Prisma.join(codes)})` : Prisma.empty}
        ${productScope === 'real' ? EXCLUDE_TEST_PRODUCTS : Prisma.empty}
        ${device ? Prisma.sql`AND be.device = ${device}` : Prisma.empty}
        ${source ? Prisma.sql`AND be.source = ${source}` : Prisma.empty}
      ORDER BY COALESCE(be."visitorHash", be."cartToken", be.id::text), be."eventType", be."productId", be."createdAt" DESC
      LIMIT ${limit}
    `;
    events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (!events.length) return [];

    const productIds = [...new Set(events.map((e) => e.productId).filter((id): id is string => !!id))];
    const eventCountryCodes = [...new Set(events.map((e) => e.countryCode).filter((c): c is string => !!c))];
    const [products, countries] = await Promise.all([
      productIds.length ? this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
      eventCountryCodes.length ? this.prisma.country.findMany({ where: { isoCode: { in: eventCountryCodes } }, select: { isoCode: true, name: true } }) : Promise.resolve([]),
    ]);
    const titleMap = new Map(products.map((p) => [p.id, p.title]));
    const nameMap = new Map(countries.map((c) => [c.isoCode, c.name]));

    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      createdAt: e.createdAt,
      productId: e.productId,
      productTitle: e.productId ? (titleMap.get(e.productId) ?? null) : null,
      countryCode: e.countryCode,
      countryName: e.countryCode ? (nameMap.get(e.countryCode) ?? e.countryCode) : null,
      cartToken: e.cartToken,
      quantity: e.quantity,
      searchQuery: e.searchQuery,
      clientIp: e.clientIp,
      device: e.device,
      source: e.source,
    }));
  }

  /**
   * Distinct Source/Country values actually present for a scope — populates
   * the event-details modal's filter dropdowns with only real options.
   * Deliberately ignores the modal's own device/source/country selections
   * (only the date/event/product scope), so picking one filter doesn't
   * shrink the others' options out from under the admin mid-selection.
   */
  async getEventDetailFilterOptions(opts: { window: DateWindow; eventTypes?: string[]; filter?: ConversionFilter; productScope?: 'real' | 'all' }): Promise<{ sources: string[]; countries: Array<{ isoCode: string; name: string }> }> {
    const { window, eventTypes, filter = {}, productScope = 'all' } = opts;
    const { since, until } = window;

    const codes = await this.countryCodesFor(filter);
    if (codes && codes.length === 0) return { sources: [], countries: [] };

    const baseConds = Prisma.sql`
      be."createdAt" >= ${since} AND be."createdAt" < ${until}
      ${eventTypes && eventTypes.length ? Prisma.sql`AND be."eventType" IN (${Prisma.join(eventTypes)})` : Prisma.empty}
      ${filter.productId ? Prisma.sql`AND be."productId" = ${filter.productId}` : Prisma.empty}
      ${codes ? Prisma.sql`AND be."countryCode" IN (${Prisma.join(codes)})` : Prisma.empty}
      ${productScope === 'real' ? EXCLUDE_TEST_PRODUCTS : Prisma.empty}
    `;

    const [sourceRows, countryCodeRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ source: string }>>`SELECT DISTINCT be.source FROM shop_behavior_events be WHERE ${baseConds} AND be.source IS NOT NULL`,
      this.prisma.$queryRaw<Array<{ countryCode: string }>>`SELECT DISTINCT be."countryCode" AS "countryCode" FROM shop_behavior_events be WHERE ${baseConds} AND be."countryCode" IS NOT NULL`,
    ]);

    const isoCodes = countryCodeRows.map((r) => r.countryCode);
    const countryRows = isoCodes.length ? await this.prisma.country.findMany({ where: { isoCode: { in: isoCodes } }, select: { isoCode: true, name: true } }) : [];
    const nameMap = new Map(countryRows.map((c) => [c.isoCode, c.name]));

    return {
      sources: sourceRows.map((r) => r.source).sort((a, b) => a.localeCompare(b)),
      countries: isoCodes.map((code) => ({ isoCode: code, name: nameMap.get(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Paid orders matching a scope, newest first — powers the "Purchased" funnel step modal. */
  async getPurchaseDetails(opts: { window: DateWindow; filter?: ConversionFilter; limit?: number }): Promise<Array<{ id: string; orderNumber: string; createdAt: Date; status: string; totalCents: number; countryCode: string | null; countryName: string | null }>> {
    const { window, filter = {}, limit = 100 } = opts;
    const { since, until } = window;

    const codes = await this.countryCodesFor(filter);
    if (codes && codes.length === 0) return [];

    const orders = filter.productId
      ? await this.prisma.$queryRaw<Array<{ id: string; orderNumber: string; createdAt: Date; status: string; totalCents: number; country: string | null }>>`
          SELECT DISTINCT o.id, o."orderNumber" AS "orderNumber", o."createdAt" AS "createdAt", o.status::text AS status, o."totalCents" AS "totalCents", o."shippingAddressSnapshot"->>'country' AS country
          FROM shop_orders o
          JOIN shop_order_items i ON i."orderId" = o.id
          WHERE o.status::text IN (${Prisma.join(PAID_STATUSES)}) AND o."createdAt" >= ${since} AND o."createdAt" < ${until}
            AND i."productId" = ${filter.productId}
            ${codes ? Prisma.sql`AND o."shippingAddressSnapshot"->>'country' IN (${Prisma.join(codes)})` : Prisma.empty}
          ORDER BY o."createdAt" DESC
          LIMIT ${limit}
        `
      : await this.prisma.$queryRaw<Array<{ id: string; orderNumber: string; createdAt: Date; status: string; totalCents: number; country: string | null }>>`
          SELECT o.id, o."orderNumber" AS "orderNumber", o."createdAt" AS "createdAt", o.status::text AS status, o."totalCents" AS "totalCents", o."shippingAddressSnapshot"->>'country' AS country
          FROM shop_orders o
          WHERE o.status::text IN (${Prisma.join(PAID_STATUSES)}) AND o."createdAt" >= ${since} AND o."createdAt" < ${until}
            ${codes ? Prisma.sql`AND o."shippingAddressSnapshot"->>'country' IN (${Prisma.join(codes)})` : Prisma.empty}
          ORDER BY o."createdAt" DESC
          LIMIT ${limit}
        `;
    if (!orders.length) return [];

    const orderCountryCodes = [...new Set(orders.map((o) => o.country).filter((c): c is string => !!c))];
    const countries = orderCountryCodes.length ? await this.prisma.country.findMany({ where: { isoCode: { in: orderCountryCodes } }, select: { isoCode: true, name: true } }) : [];
    const nameMap = new Map(countries.map((c) => [c.isoCode, c.name]));

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status as string,
      totalCents: o.totalCents,
      countryCode: o.country,
      countryName: o.country ? (nameMap.get(o.country) ?? o.country) : null,
    }));
  }

  // ── Search insights ───────────────────────────────────────────────────────

  async getSearchOverview(days = 30): Promise<{ totalSearches: number; zeroResultSearches: number; zeroResultRatePct: number }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [totalSearches, zeroResultSearches] = await Promise.all([
      this.prisma.shopBehaviorEvent.count({ where: { eventType: 'search', createdAt: { gte: since } } }),
      this.prisma.shopBehaviorEvent.count({ where: { eventType: 'search', createdAt: { gte: since }, resultCount: 0 } }),
    ]);
    return { totalSearches, zeroResultSearches, zeroResultRatePct: pct(zeroResultSearches, totalSearches) };
  }

  async getTopSearches(days = 30, limit = 20): Promise<Array<{ query: string; count: number }>> {
    return this.searchGroupedBy(days, limit, false);
  }

  async getZeroResultSearches(days = 30, limit = 20): Promise<Array<{ query: string; count: number }>> {
    return this.searchGroupedBy(days, limit, true);
  }

  private async searchGroupedBy(days: number, limit: number, zeroResultOnly: boolean): Promise<Array<{ query: string; count: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<Array<{ query: string; count: bigint }>>`
      SELECT LOWER(be."searchQuery") AS query, COUNT(be.id)::bigint AS count
      FROM shop_behavior_events be
      WHERE be."eventType" = 'search' AND be."createdAt" >= ${since} AND be."searchQuery" IS NOT NULL
        ${zeroResultOnly ? Prisma.sql`AND be."resultCount" = 0` : Prisma.empty}
      GROUP BY LOWER(be."searchQuery")
      ORDER BY COUNT(be.id) DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ query: r.query, count: Number(r.count) }));
  }

  // ── Per-customer behavior timeline ────────────────────────────────────────

  async getCustomerTimeline(shopCustomerId: string): Promise<TimelineEntry[]> {
    const [behaviorEvents, orders, wishlistItems] = await Promise.all([
      this.prisma.shopBehaviorEvent.findMany({ where: { shopCustomerId }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.order.findMany({ where: { customerId: shopCustomerId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.wishlistItem.findMany({ where: { userId: shopCustomerId }, orderBy: { addedAt: 'desc' } }),
    ]);

    const productIds = [...new Set([...behaviorEvents.map((e) => e.productId).filter((id): id is string => !!id), ...wishlistItems.map((w) => w.productId)])];
    const products = productIds.length ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true } }) : [];
    const titleMap = new Map(products.map((p) => [p.id, p.title]));

    const timeline: TimelineEntry[] = [
      ...behaviorEvents.map((e) => ({
        type: e.eventType as string,
        date: e.createdAt,
        productId: e.productId,
        productTitle: e.productId ? (titleMap.get(e.productId) ?? null) : null,
        searchQuery: e.searchQuery,
        resultCount: e.resultCount,
        quantity: e.quantity,
        orderId: null,
        orderNumber: null,
        orderStatus: null,
        totalCents: null,
      })),
      ...orders.map((o) => ({
        type: 'order',
        date: o.createdAt,
        productId: null,
        productTitle: null,
        searchQuery: null,
        resultCount: null,
        quantity: null,
        orderId: o.id,
        orderNumber: o.orderNumber,
        orderStatus: o.status as string,
        totalCents: o.totalCents,
      })),
      ...wishlistItems.map((w) => ({
        type: 'wishlist_add',
        date: w.addedAt,
        productId: w.productId,
        productTitle: titleMap.get(w.productId) ?? null,
        searchQuery: null,
        resultCount: null,
        quantity: null,
        orderId: null,
        orderNumber: null,
        orderStatus: null,
        totalCents: null,
      })),
    ];

    return timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
