import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ipMatchesAny, parseIpRules } from '../common/utils/ip-match.util';

const TIMEZONE_KEY = 'business_timezone';
const DEFAULT_TZ = 'Europe/Paris';
const META_PIXEL_ID_KEY = 'meta_pixel_id';
const META_PIXEL_ENABLED_KEY = 'meta_pixel_enabled';
const TIKTOK_PIXEL_ID_KEY = 'tiktok_pixel_id';
const TIKTOK_PIXEL_ENABLED_KEY = 'tiktok_pixel_enabled';
const ANALYTICS_EXCLUDED_IPS_KEY = 'analytics_excluded_ips';
const ANALYTICS_BOT_USER_AGENTS_KEY = 'analytics_bot_user_agents';
const LOW_STOCK_ALERTS_ENABLED_KEY = 'low_stock_alerts_enabled';
const DISPLAY_CURRENCY_CODE_KEY = 'display_currency_code';
const DISPLAY_CURRENCY_SYMBOL_POSITION_KEY = 'display_currency_symbol_position';
const DISPLAY_CURRENCY_DECIMAL_PLACES_KEY = 'display_currency_decimal_places';
const DEFAULT_CURRENCY: CurrencyConfig = { code: 'EUR', symbolPosition: 'after', decimalPlaces: 2 };
const CACHE_TTL_MS = 60_000; // refresh ceiling: 60 s

/**
 * Used only when the admin has never saved a list of their own — an empty
 * saved list is a deliberate "stop filtering" choice and is respected as-is.
 * Broad substrings (bot/spider/crawl) catch the vast majority of
 * self-identifying crawlers by convention (Googlebot, Twitterbot, AhrefsBot,
 * GPTBot, ClaudeBot, Baiduspider, UptimeRobot, ...); the rest are named
 * crawlers/tools that don't include those words in their UA string.
 */
const DEFAULT_BOT_USER_AGENT_PATTERNS = ['bot', 'spider', 'crawl', 'facebookexternalhit', 'facebookcatalog', 'whatsapp', 'telegrambot', 'skypeuripreview', 'pingdom', 'gtmetrix', 'headlesschrome', 'phantomjs', 'python-requests', 'curl/', 'postman', 'node-fetch', 'go-http-client', 'axios/'];

export interface MetaPixelConfig {
  pixelId: string | null;
  enabled: boolean;
}

export interface TikTokPixelConfig {
  pixelId: string | null;
  enabled: boolean;
}

export interface CurrencyConfig {
  code: string;
  symbolPosition: 'before' | 'after';
  decimalPlaces: number;
}

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformSettingsService.name);

  private cachedTimezone: string = DEFAULT_TZ;
  private cachedMetaPixel: MetaPixelConfig = { pixelId: null, enabled: false };
  private cachedTikTokPixel: TikTokPixelConfig = { pixelId: null, enabled: false };
  private cachedExcludedIps: string[] = [];
  private cachedBotUserAgentPatterns: string[] = DEFAULT_BOT_USER_AGENT_PATTERNS;
  // Admin must opt in — off until explicitly enabled.
  private cachedLowStockAlertsEnabled = false;
  private cachedCurrency: CurrencyConfig = DEFAULT_CURRENCY;
  private cacheExpiresAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.warmCache();
  }

  // ── Public read (synchronous, cached) ──────────────────────────────────

  getTimezone(): string {
    this.refreshIfStale();
    return this.cachedTimezone;
  }

  getMetaPixelConfig(): MetaPixelConfig {
    this.refreshIfStale();
    return this.cachedMetaPixel;
  }

  getTikTokPixelConfig(): TikTokPixelConfig {
    this.refreshIfStale();
    return this.cachedTikTokPixel;
  }

  /** Admin-configured addresses whose traffic is kept out of shop analytics. */
  getAnalyticsExcludedIps(): string[] {
    this.refreshIfStale();
    return this.cachedExcludedIps;
  }

  /**
   * Whether an address should be left out of analytics — staff browsing their
   * own shop would otherwise register as real demand.
   *
   * Reads from the 60 s cache, so this is safe on the hot event-write path.
   */
  isAnalyticsExcluded(ip: string | null | undefined): boolean {
    return ipMatchesAny(ip, this.getAnalyticsExcludedIps());
  }

  /** Admin-configured (or, if unset, built-in default) bot/crawler UA substrings. */
  getAnalyticsBotUserAgentPatterns(): string[] {
    this.refreshIfStale();
    return this.cachedBotUserAgentPatterns;
  }

  /**
   * Whether a request's User-Agent looks like a bot/crawler rather than a
   * real visitor — checked before writing a shop behavior event, the same
   * way `isAnalyticsExcluded` is checked for IPs.
   *
   * A missing/empty UA is treated as bot-like too: every real browser sends
   * one, so its absence means a script or scraper, not a visitor.
   */
  isBotUserAgent(userAgent: string | null | undefined): boolean {
    if (!userAgent) return true;
    const ua = userAgent.toLowerCase();
    return this.getAnalyticsBotUserAgentPatterns().some((p) => ua.includes(p));
  }

  /** Whether admin low-stock threshold-crossing alerts (email + SMS) are enabled. */
  isLowStockAlertsEnabled(): boolean {
    this.refreshIfStale();
    return this.cachedLowStockAlertsEnabled;
  }

  /** Display/formatting only — does not affect how Stripe transacts (PaymentTransaction.currency stays authoritative for money movement). */
  getCurrencyConfig(): CurrencyConfig {
    this.refreshIfStale();
    return this.cachedCurrency;
  }

  getPlatformConfig(): { timezone: string; metaPixel: MetaPixelConfig; tiktokPixel: TikTokPixelConfig; currency: CurrencyConfig } {
    return {
      timezone: this.getTimezone(),
      metaPixel: this.getMetaPixelConfig(),
      tiktokPixel: this.getTikTokPixelConfig(),
      currency: this.getCurrencyConfig(),
    };
  }

  // ── Public write ─────────────────────────────────────────────────────────

  async setTimezone(tz: string): Promise<void> {
    if (!isValidIANA(tz)) {
      throw new BadRequestException(`Invalid IANA timezone identifier: "${tz}"`);
    }
    await this.upsert(TIMEZONE_KEY, tz);
    this.cachedTimezone = tz;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Business timezone updated to "${tz}"`);
  }

  async setMetaPixelConfig(input: { pixelId: string | null; enabled: boolean }): Promise<void> {
    const pixelId = input.pixelId?.trim() || null;
    if (input.enabled && !isValidPixelId(pixelId)) {
      throw new BadRequestException('A valid numeric Meta Pixel ID is required to enable it');
    }
    await Promise.all([this.upsert(META_PIXEL_ID_KEY, pixelId ?? ''), this.upsert(META_PIXEL_ENABLED_KEY, String(input.enabled))]);
    this.cachedMetaPixel = { pixelId, enabled: input.enabled };
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Meta Pixel config updated (enabled=${input.enabled})`);
  }

  async setTikTokPixelConfig(input: { pixelId: string | null; enabled: boolean }): Promise<void> {
    const pixelId = input.pixelId?.trim() || null;
    if (input.enabled && !isValidTikTokPixelId(pixelId)) {
      throw new BadRequestException('A valid TikTok Pixel Code is required to enable it');
    }
    await Promise.all([this.upsert(TIKTOK_PIXEL_ID_KEY, pixelId ?? ''), this.upsert(TIKTOK_PIXEL_ENABLED_KEY, String(input.enabled))]);
    this.cachedTikTokPixel = { pixelId, enabled: input.enabled };
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`TikTok Pixel config updated (enabled=${input.enabled})`);
  }

  /**
   * Replaces the exclusion list. Returns the entries that could not be parsed so
   * the admin sees them rather than assuming a typo took effect.
   */
  async setAnalyticsExcludedIps(raw: string): Promise<{ rules: string[]; invalid: string[] }> {
    const { rules, invalid } = parseIpRules(raw ?? '');
    await this.upsert(ANALYTICS_EXCLUDED_IPS_KEY, rules.join('\n'));
    this.cachedExcludedIps = rules;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Analytics IP exclusions updated (${rules.length} rule(s))`);
    return { rules, invalid };
  }

  /**
   * Appends a single address to the exclusion list without disturbing the
   * rest — powers the "block this IP" action on an analytics event-detail
   * row, where re-sending the admin's full edited textarea isn't available.
   */
  async addAnalyticsExcludedIp(ip: string): Promise<{ rules: string[]; invalid: string[] }> {
    const combined = [...this.getAnalyticsExcludedIps(), ip].join('\n');
    return this.setAnalyticsExcludedIps(combined);
  }

  /**
   * Replaces the bot User-Agent pattern list. An explicitly empty list is
   * respected (stops bot filtering) rather than falling back to the default.
   */
  async setAnalyticsBotUserAgentPatterns(raw: string): Promise<{ patterns: string[] }> {
    const patterns = [
      ...new Set(
        (raw ?? '')
          .split(/[\n,]/)
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    await this.upsert(ANALYTICS_BOT_USER_AGENTS_KEY, patterns.join('\n'));
    this.cachedBotUserAgentPatterns = patterns;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Analytics bot UA patterns updated (${patterns.length} pattern(s))`);
    return { patterns };
  }

  async setLowStockAlertsEnabled(enabled: boolean): Promise<void> {
    await this.upsert(LOW_STOCK_ALERTS_ENABLED_KEY, String(enabled));
    this.cachedLowStockAlertsEnabled = enabled;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Low stock alerts ${enabled ? 'enabled' : 'disabled'}`);
  }

  async setCurrencyConfig(input: CurrencyConfig): Promise<void> {
    const code = input.code?.trim().toUpperCase();
    if (!code || !/^[A-Z]{3}$/.test(code)) {
      throw new BadRequestException('code must be a 3-letter ISO 4217 currency code');
    }
    if (input.decimalPlaces < 0 || input.decimalPlaces > 4) {
      throw new BadRequestException('decimalPlaces must be between 0 and 4');
    }
    const config: CurrencyConfig = { code, symbolPosition: input.symbolPosition, decimalPlaces: input.decimalPlaces };
    await Promise.all([this.upsert(DISPLAY_CURRENCY_CODE_KEY, config.code), this.upsert(DISPLAY_CURRENCY_SYMBOL_POSITION_KEY, config.symbolPosition), this.upsert(DISPLAY_CURRENCY_DECIMAL_PLACES_KEY, String(config.decimalPlaces))]);
    this.cachedCurrency = config;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Display currency updated to ${config.code}`);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private upsert(key: string, value: string) {
    return this.prisma.platformSettings.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  private refreshIfStale(): void {
    if (Date.now() > this.cacheExpiresAt) {
      // Refresh in background; serve stale in the meantime
      this.warmCache().catch((err) => this.logger.warn(`PlatformSettings cache refresh failed: ${(err as Error).message}`));
    }
  }

  private async warmCache(): Promise<void> {
    try {
      const rows = await this.prisma.platformSettings.findMany({
        where: {
          key: {
            in: [TIMEZONE_KEY, META_PIXEL_ID_KEY, META_PIXEL_ENABLED_KEY, TIKTOK_PIXEL_ID_KEY, TIKTOK_PIXEL_ENABLED_KEY, ANALYTICS_EXCLUDED_IPS_KEY, ANALYTICS_BOT_USER_AGENTS_KEY, LOW_STOCK_ALERTS_ENABLED_KEY, DISPLAY_CURRENCY_CODE_KEY, DISPLAY_CURRENCY_SYMBOL_POSITION_KEY, DISPLAY_CURRENCY_DECIMAL_PLACES_KEY],
          },
        },
      });
      const byKey = new Map(rows.map((r) => [r.key, r.value]));

      this.cachedTimezone = byKey.get(TIMEZONE_KEY) ?? DEFAULT_TZ;
      this.cachedMetaPixel = {
        pixelId: byKey.get(META_PIXEL_ID_KEY) || null,
        enabled: byKey.get(META_PIXEL_ENABLED_KEY) === 'true',
      };
      this.cachedTikTokPixel = {
        pixelId: byKey.get(TIKTOK_PIXEL_ID_KEY) || null,
        enabled: byKey.get(TIKTOK_PIXEL_ENABLED_KEY) === 'true',
      };
      this.cachedExcludedIps = (byKey.get(ANALYTICS_EXCLUDED_IPS_KEY) ?? '')
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      // No saved row at all -> nobody has configured this yet, use the
      // built-in defaults. A saved row that parses to zero patterns is a
      // deliberate "stop filtering" choice and is respected as empty.
      this.cachedBotUserAgentPatterns = byKey.has(ANALYTICS_BOT_USER_AGENTS_KEY)
        ? byKey
            .get(ANALYTICS_BOT_USER_AGENTS_KEY)!
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean)
        : DEFAULT_BOT_USER_AGENT_PATTERNS;
      this.cachedLowStockAlertsEnabled = byKey.get(LOW_STOCK_ALERTS_ENABLED_KEY) === 'true';
      this.cachedCurrency = {
        code: byKey.get(DISPLAY_CURRENCY_CODE_KEY) ?? DEFAULT_CURRENCY.code,
        symbolPosition: (byKey.get(DISPLAY_CURRENCY_SYMBOL_POSITION_KEY) as 'before' | 'after') ?? DEFAULT_CURRENCY.symbolPosition,
        decimalPlaces: byKey.has(DISPLAY_CURRENCY_DECIMAL_PLACES_KEY) ? parseInt(byKey.get(DISPLAY_CURRENCY_DECIMAL_PLACES_KEY)!, 10) : DEFAULT_CURRENCY.decimalPlaces,
      };
      this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    } catch (err) {
      this.logger.warn(`PlatformSettings warm cache failed: ${(err as Error).message}`);
    }
  }
}

function isValidIANA(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidPixelId(pixelId: string | null): pixelId is string {
  return !!pixelId && /^\d{10,20}$/.test(pixelId);
}

/** TikTok Pixel Codes are alphanumeric (e.g. "DA3FPARC77U2K1LUCIV0"), unlike Meta's numeric-only IDs. */
function isValidTikTokPixelId(pixelId: string | null): pixelId is string {
  return !!pixelId && /^[A-Z0-9]{10,32}$/i.test(pixelId);
}
