import { Controller, Get, Post, Query } from '@nestjs/common';
import { ShopAnalyticsAggregatorService } from './shop-analytics-aggregator.service';
import { ShopAnalyticsService } from './shop-analytics.service';
import { ShopBehaviorAnalyticsService } from './shop-behavior-analytics.service';
import { boolParam, intParam, resolveWindow, testProductSort } from './analytics-filters';

@Controller('admin/shop/analytics')
export class ShopAnalyticsController {
  constructor(
    private readonly aggregator: ShopAnalyticsAggregatorService,
    private readonly analytics: ShopAnalyticsService,
    private readonly behaviorAnalytics: ShopBehaviorAnalyticsService,
  ) {}

  @Get('overview')
  async overview(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    const [data, computedAt] = await Promise.all([this.aggregator.getOverviewCached(d === 7 ? 7 : 30), this.aggregator.getComputedAt()]);
    return { ...data, computedAt };
  }

  @Get('best-sellers')
  async bestSellers(@Query('days') days?: string, @Query('limit') limit?: string) {
    const d = days ? parseInt(days, 10) : 30;
    const lim = limit ? parseInt(limit, 10) : 10;
    return this.aggregator.getBestSellersCached(d === 7 ? 7 : 30, lim);
  }

  @Get('revenue-series')
  revenueSeries(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.aggregator.getRevenueSeriesCached(d === 7 ? 7 : 30);
  }

  @Get('customers')
  customers(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.analytics.getCustomerInsights(d);
  }

  @Get('promotions')
  promotions(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.analytics.getPromotionPerformance(d);
  }

  @Get('inventory')
  inventory() {
    return this.analytics.getInventoryAnalytics();
  }

  // Force re-aggregation on demand (e.g. after a data import)
  @Post('aggregate')
  async aggregate() {
    await this.aggregator.aggregate();
    return { ok: true, computedAt: await this.aggregator.getComputedAt() };
  }

  @Get('conversion-funnel')
  conversionFunnel(@Query('days') days?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('countryCode') countryCode?: string, @Query('continent') continent?: string, @Query('productId') productId?: string) {
    return this.behaviorAnalytics.getConversionFunnel(resolveWindow({ days, startDate, endDate }), { countryCode, continent, productId });
  }

  // Demand validation for test products: views -> cart -> reached checkout.
  @Get('test-products')
  testProducts(
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('productId') productId?: string,
    @Query('productStatus') productStatus?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brand') brand?: string,
    @Query('minPriceCents') minPriceCents?: string,
    @Query('maxPriceCents') maxPriceCents?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('limit') limit?: string,
    @Query('minViews') minViews?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('reachedCheckoutOnly') reachedCheckoutOnly?: string,
    @Query('countryCode') countryCode?: string,
    @Query('continent') continent?: string,
    @Query('scope') scope?: string,
  ) {
    return this.behaviorAnalytics.getTestProductDemand(resolveWindow({ days, startDate, endDate }), {
      // Defaults to the test report — the endpoint's original and only
      // behaviour, so an existing caller keeps getting what it got.
      scope: scope === 'live' ? 'live' : 'test',
      countryCode,
      continent,
      productId,
      productStatus,
      categoryId,
      brand,
      minPriceCents: intParam(minPriceCents),
      maxPriceCents: intParam(maxPriceCents),
      search,
      sort: testProductSort(sort),
      order: order === 'asc' ? 'asc' : 'desc',
      limit: intParam(limit),
      minViews: intParam(minViews),
      activeOnly: boolParam(activeOnly),
      reachedCheckoutOnly: boolParam(reachedCheckoutOnly),
    });
  }

  @Get('conversion-by-product')
  conversionByProduct(@Query('days') days?: string, @Query('limit') limit?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('countryCode') countryCode?: string, @Query('continent') continent?: string, @Query('productId') productId?: string) {
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getProductConversion(resolveWindow({ days, startDate, endDate }), lim, { countryCode, continent, productId });
  }

  @Get('country-breakdown')
  countryBreakdown(@Query('days') days?: string, @Query('limit') limit?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('productId') productId?: string) {
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getCountryBreakdown(resolveWindow({ days, startDate, endDate }), lim, { productId });
  }

  // Drill-down detail lists for the click-through modals.
  @Get('event-details')
  eventDetails(
    @Query('eventType') eventType?: string,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('countryCode') countryCode?: string,
    @Query('continent') continent?: string,
    @Query('productId') productId?: string,
    @Query('limit') limit?: string,
    @Query('productScope') productScope?: string,
    @Query('device') device?: string,
    @Query('source') source?: string,
  ) {
    return this.behaviorAnalytics.getEventDetails({
      window: resolveWindow({ days, startDate, endDate }),
      eventTypes: eventType ? eventType.split(',') : undefined,
      filter: { countryCode, continent, productId },
      limit: intParam(limit),
      productScope: productScope === 'real' ? 'real' : 'all',
      device: device === 'mobile' || device === 'desktop' ? device : undefined,
      source: source || undefined,
    });
  }

  // Distinct Source/Country values actually present for a scope — populates
  // the event-details modal's filter dropdowns with only real options.
  @Get('event-detail-filters')
  eventDetailFilters(@Query('eventType') eventType?: string, @Query('days') days?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('countryCode') countryCode?: string, @Query('continent') continent?: string, @Query('productId') productId?: string, @Query('productScope') productScope?: string) {
    return this.behaviorAnalytics.getEventDetailFilterOptions({
      window: resolveWindow({ days, startDate, endDate }),
      eventTypes: eventType ? eventType.split(',') : undefined,
      filter: { countryCode, continent, productId },
      productScope: productScope === 'real' ? 'real' : 'all',
    });
  }

  @Get('purchase-details')
  purchaseDetails(@Query('days') days?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('countryCode') countryCode?: string, @Query('continent') continent?: string, @Query('productId') productId?: string, @Query('limit') limit?: string) {
    return this.behaviorAnalytics.getPurchaseDetails({
      window: resolveWindow({ days, startDate, endDate }),
      filter: { countryCode, continent, productId },
      limit: intParam(limit),
    });
  }

  @Get('search-overview')
  searchOverview(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.behaviorAnalytics.getSearchOverview(d);
  }

  @Get('top-searches')
  topSearches(@Query('days') days?: string, @Query('limit') limit?: string) {
    const d = days ? parseInt(days, 10) : 30;
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getTopSearches(d, lim);
  }

  @Get('zero-result-searches')
  zeroResultSearches(@Query('days') days?: string, @Query('limit') limit?: string) {
    const d = days ? parseInt(days, 10) : 30;
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getZeroResultSearches(d, lim);
  }
}
