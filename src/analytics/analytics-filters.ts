/**
 * Shared query-param resolution for the shop behavior-analytics endpoints.
 *
 * Every endpoint takes either a rolling `?days=` window or an explicit
 * `startDate`/`endDate` custom range, plus the typed filter shapes the
 * conversion and test-product reports accept.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateWindowParams {
  days?: string;
  startDate?: string;
  endDate?: string;
}

export interface DateWindow {
  since: Date;
  /** Exclusive upper bound (`createdAt < until`). */
  until: Date;
  /** Span in whole days, for display. */
  days: number;
}

/**
 * Resolve a date window from raw query strings.
 * - An explicit `startDate` (and optional `endDate`, inclusive) wins.
 * - Otherwise falls back to the rolling last-`days` window (default 30).
 * Invalid dates are ignored so a bad param can never blank the report.
 */
export function resolveWindow(p: DateWindowParams): DateWindow {
  const now = Date.now();
  const startMs = p.startDate ? Date.parse(p.startDate) : NaN;
  const endMs = p.endDate ? Date.parse(p.endDate) : NaN;

  if (!Number.isNaN(startMs) || !Number.isNaN(endMs)) {
    // endDate is inclusive → advance one day to an exclusive upper bound.
    const until = !Number.isNaN(endMs) ? new Date(endMs + DAY_MS) : new Date(now);
    const fallbackDays = p.days ? parseInt(p.days, 10) || 30 : 30;
    const since = !Number.isNaN(startMs) ? new Date(startMs) : new Date(until.getTime() - fallbackDays * DAY_MS);
    const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / DAY_MS));
    return { since, until, days };
  }

  const days = p.days ? Math.max(1, parseInt(p.days, 10) || 30) : 30;
  return { since: new Date(now - days * DAY_MS), until: new Date(now), days };
}

/** Country scope shared by the conversion endpoints. */
export interface CountryFilter {
  countryCode?: string;
  continent?: string;
}

/** Scope applied to the conversion endpoints (country + a single product). */
export interface ConversionFilter extends CountryFilter {
  productId?: string;
}

export type TestProductSort = 'views' | 'addsToCart' | 'reachedShipping' | 'reachedCheckout' | 'viewToCartRatePct' | 'cartToShippingRatePct' | 'cartToCheckoutRatePct' | 'viewToCheckoutRatePct';

const TEST_PRODUCT_SORTS: TestProductSort[] = ['views', 'addsToCart', 'reachedShipping', 'reachedCheckout', 'viewToCartRatePct', 'cartToShippingRatePct', 'cartToCheckoutRatePct', 'viewToCheckoutRatePct'];

export interface TestProductFilter extends CountryFilter {
  /**
   * Which phase of the catalogue to report on. 'test' is the demand-validation
   * report; 'live' is the same funnel for products actually on sale.
   *
   * Not the same thing as Product.isTestProduct: a product promoted from test
   * to live belongs to BOTH reports — its test-phase events under 'test', its
   * live-phase events under 'live' — so the scope is matched against the state
   * recorded on each event, not against the product's flag today.
   */
  scope?: 'test' | 'live';
  productId?: string;
  productStatus?: string;
  categoryId?: string;
  brand?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  search?: string;
  sort?: TestProductSort;
  order?: 'asc' | 'desc';
  limit?: number;
  /** Hide products with no views/adds/checkout activity in the window. */
  activeOnly?: boolean;
  /** Only products where at least one customer reached checkout. */
  reachedCheckoutOnly?: boolean;
  /** Minimum view count. */
  minViews?: number;
}

/** Parse the optional `?param` string into an int, or undefined when absent/invalid. */
export function intParam(raw?: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a boolean-ish query string (`true`/`1`). */
export function boolParam(raw?: string): boolean {
  return raw === 'true' || raw === '1';
}

/** Validate a sort key, falling back to undefined (caller picks its default). */
export function testProductSort(raw?: string): TestProductSort | undefined {
  return TEST_PRODUCT_SORTS.includes(raw as TestProductSort) ? (raw as TestProductSort) : undefined;
}
