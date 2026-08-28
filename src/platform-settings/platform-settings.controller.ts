import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CurrencyConfig, MapTilesConfig, MetaPixelConfig, PlatformSettingsService, TikTokPixelConfig } from './platform-settings.service';

interface UpdateTimezoneDto {
  timezone: string;
}

interface UpdateMetaPixelDto {
  pixelId: string | null;
  enabled: boolean;
}

interface UpdateTikTokPixelDto {
  pixelId: string | null;
  enabled: boolean;
}

@Controller()
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  /** Public — readable by the storefront for SSR timezone / pixel / currency-formatting injection. */
  @Get('public/platform-settings')
  @Public()
  getConfig(): { timezone: string; metaPixel: MetaPixelConfig; tiktokPixel: TikTokPixelConfig; currency: CurrencyConfig; mapTiles: MapTilesConfig } {
    return this.service.getPlatformConfig();
  }

  /** Admin-only — updates the business timezone. */
  @Put('admin/platform-settings')
  @HttpCode(HttpStatus.OK)
  async update(@Body() body: UpdateTimezoneDto) {
    await this.service.setTimezone(body.timezone);
    return this.service.getPlatformConfig();
  }

  /** Admin-only — basemap used by the pickup-point picker. */
  @Put('admin/platform-settings/map-tiles')
  @HttpCode(HttpStatus.OK)
  async updateMapTiles(@Body() body: MapTilesConfig) {
    await this.service.setMapTilesConfig(body);
    return this.service.getPlatformConfig();
  }

  /** Admin-only — updates the Meta Pixel ID / enabled flag. */
  @Put('admin/platform-settings/meta-pixel')
  @HttpCode(HttpStatus.OK)
  async updateMetaPixel(@Body() body: UpdateMetaPixelDto) {
    await this.service.setMetaPixelConfig(body);
    return this.service.getPlatformConfig();
  }

  /** Admin-only — updates the TikTok Pixel Code / enabled flag. */
  @Put('admin/platform-settings/tiktok-pixel')
  @HttpCode(HttpStatus.OK)
  async updateTikTokPixel(@Body() body: UpdateTikTokPixelDto) {
    await this.service.setTikTokPixelConfig(body);
    return this.service.getPlatformConfig();
  }

  /** Admin-only — addresses excluded from shop analytics. */
  @Get('admin/platform-settings/analytics-excluded-ips')
  getAnalyticsExcludedIps(): { rules: string[] } {
    return { rules: this.service.getAnalyticsExcludedIps() };
  }

  /**
   * Admin-only — replaces the exclusion list. Echoes back anything unparseable
   * so the UI can tell the admin their entry did not take effect.
   */
  @Put('admin/platform-settings/analytics-excluded-ips')
  @HttpCode(HttpStatus.OK)
  async updateAnalyticsExcludedIps(@Body() body: { value: string }) {
    return this.service.setAnalyticsExcludedIps(body?.value ?? '');
  }

  /**
   * Admin-only — appends a single address without disturbing the rest of the
   * list. Powers the "block this IP" action on an analytics event-detail row.
   */
  @Post('admin/platform-settings/analytics-excluded-ips/add')
  @HttpCode(HttpStatus.OK)
  async addAnalyticsExcludedIp(@Body() body: { ip: string }) {
    if (!body?.ip?.trim()) {
      throw new BadRequestException('An address is required');
    }
    return this.service.addAnalyticsExcludedIp(body.ip.trim());
  }

  /** Admin-only — bot/crawler User-Agent substrings excluded from shop analytics. */
  @Get('admin/platform-settings/analytics-bot-user-agents')
  getAnalyticsBotUserAgents(): { patterns: string[] } {
    return { patterns: this.service.getAnalyticsBotUserAgentPatterns() };
  }

  /** Admin-only — replaces the bot User-Agent pattern list. */
  @Put('admin/platform-settings/analytics-bot-user-agents')
  @HttpCode(HttpStatus.OK)
  async updateAnalyticsBotUserAgents(@Body() body: { value: string }) {
    return this.service.setAnalyticsBotUserAgentPatterns(body?.value ?? '');
  }

  /** Admin-only — whether the Meta Conversions API access token is set server-side. Never returns the token itself. */
  @Get('admin/platform-settings/meta-capi-status')
  getCapiStatus(): { configured: boolean } {
    return { configured: !!process.env.META_CAPI_ACCESS_TOKEN };
  }

  /** Admin-only — whether the TikTok Events API access token is set server-side. Never returns the token itself. */
  @Get('admin/platform-settings/tiktok-events-api-status')
  getTikTokEventsApiStatus(): { configured: boolean } {
    return { configured: !!process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN };
  }

  /** Admin-only — whether admin low-stock threshold-crossing alerts (email + SMS) are enabled. */
  @Get('admin/platform-settings/low-stock-alerts')
  getLowStockAlertsEnabled(): { enabled: boolean } {
    return { enabled: this.service.isLowStockAlertsEnabled() };
  }

  /** Admin-only — enables/disables low-stock alerts. */
  @Put('admin/platform-settings/low-stock-alerts')
  @HttpCode(HttpStatus.OK)
  async updateLowStockAlertsEnabled(@Body() body: { enabled: boolean }): Promise<{ enabled: boolean }> {
    await this.service.setLowStockAlertsEnabled(!!body?.enabled);
    return { enabled: this.service.isLowStockAlertsEnabled() };
  }

  /** Admin-only — the store's current display currency config. */
  @Get('admin/platform-settings/currency')
  getCurrency(): CurrencyConfig {
    return this.service.getCurrencyConfig();
  }

  /** Admin-only — updates the store's display currency (formatting only — does not affect Stripe money movement). */
  @Put('admin/platform-settings/currency')
  @HttpCode(HttpStatus.OK)
  async updateCurrency(@Body() body: CurrencyConfig): Promise<CurrencyConfig> {
    await this.service.setCurrencyConfig(body);
    return this.service.getCurrencyConfig();
  }
}
