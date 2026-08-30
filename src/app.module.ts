import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { baseRedisOptions } from './redis/redis.options';
import { RedisLockModule } from './common/redis-lock/redis-lock.module';
import { AssetUrlModule } from './asset-url/asset-url.module';
import { MeilisearchModule } from './meilisearch/meilisearch.module';
import { DlqModule } from './dlq/dlq.module';
import { ErrorCollectorModule } from './common/error-collector/error-collector.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { SmsModule } from './sms/sms.module';
import { GcsModule } from './gcs/gcs.module';
import { MediaModule } from './media/media.module';
import { TranslationsModule } from './translations/translations.module';
import { DocumentsModule } from './documents/documents.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { AntiSpamModule } from './common/anti-spam/anti-spam.module';
import { IntegrationCredentialsModule } from './integration-credentials/integration-credentials.module';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './catalog/catalog.module';
import { CommerceEventsModule } from './commerce-events/commerce-events.module';
import { InventoryModule } from './inventory/inventory.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { CountriesModule } from './countries/countries.module';
import { CustomersModule } from './customers/customers.module';
import { ShippingModule } from './shipping/shipping.module';
import { PromotionsModule } from './promotions/promotions.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CollectionsModule } from './collections/collections.module';
import { HomeSectionsModule } from './home-sections/home-sections.module';
import { PriceRulesModule } from './price-rules/price-rules.module';
import { TaxModule } from './tax/tax.module';
import { ReturnsModule } from './returns/returns.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { CommerceNotificationsModule } from './commerce-notifications/commerce-notifications.module';
import { AnalyticsTrackingModule } from './analytics-tracking/analytics-tracking.module';
import { ReplayModule } from './replay/replay.module';
import { EmailModule } from './email/email.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { ContactsModule } from './contacts/contacts.module';
import { SupportModule } from './support/support.module';
import { MetaCapiModule } from './marketing/meta-capi/meta-capi.module';
import { TikTokEventsModule } from './marketing/tiktok-events/tiktok-events.module';
import { BlogModule } from './blog/blog.module';
import { PageContentModule } from './page-content/page-content.module';

@Module({
  imports: [
    PrismaModule,
    MeilisearchModule,
    // Redis-backed, not the default in-memory store: with the HPA running N
    // API replicas an in-memory counter makes the real limit N x the configured
    // one, so `auth: 10 per 15min` would become 100 per 15min at 10 pods —
    // brute-force protection would weaken exactly when the site is busiest.
    // forRootAsync, not forRoot: this module is imported by main.ts *before*
    // dotenv's config() runs, so anything built eagerly in the decorator
    // metadata reads a process.env that has no .env values in it yet and would
    // connect to Redis with no password. The factory runs at bootstrap instead.
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          { name: 'auth', ttl: 15 * 60 * 1000, limit: 10 },
          { name: 'contact', ttl: 15 * 60 * 1000, limit: 5 },
        ],
        storage: new ThrottlerStorageRedisService(
          new Redis({
            ...baseRedisOptions(),
            keyPrefix: 'throttle:',
            // Bounded so a Redis outage fails the throttler check quickly
            // instead of parking the request until the client reconnects.
            commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 1_000),
          }),
        ),
      }),
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    // BullMQ uses its own Redis connection (BULLMQ_REDIS_*), separate from
    // the cache/idempotency Redis (REDIS_*) — set BULLMQ_REDIS_DB to a
    // different logical DB, or point it at a dedicated instance with
    // maxmemory-policy noeviction so queued jobs are never evicted.
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host:
            process.env.BULLMQ_REDIS_HOST ??
            process.env.REDIS_HOST ??
            'localhost',
          port: Number(
            process.env.BULLMQ_REDIS_PORT ?? process.env.REDIS_PORT ?? 6379,
          ),
          password:
            process.env.BULLMQ_REDIS_PASSWORD ??
            process.env.REDIS_PASSWORD ??
            undefined,
          db: Number(process.env.BULLMQ_REDIS_DB ?? 1),
        },
      }),
    }),
    RedisModule,
    RedisLockModule,
    AssetUrlModule,
    DlqModule,
    ErrorCollectorModule,
    CommerceEventsModule,
    SmsModule,
    AuthModule,
    AdminsModule,
    GcsModule,
    MediaModule,
    TranslationsModule,
    DocumentsModule,
    PlatformSettingsModule,
    AntiSpamModule,
    IntegrationCredentialsModule,
    HealthModule,
    CatalogModule,
    InventoryModule,
    CartModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
    WebhooksModule,
    CountriesModule,
    CustomersModule,
    ShippingModule,
    PromotionsModule,
    CampaignsModule,
    CollectionsModule,
    HomeSectionsModule,
    PriceRulesModule,
    TaxModule,
    ReturnsModule,
    ReviewsModule,
    WishlistModule,
    PaymentMethodsModule,
    CommerceNotificationsModule,
    AnalyticsTrackingModule,
    ReplayModule,
    EmailModule,
    AnalyticsModule,
    NewsletterModule,
    ContactsModule,
    SupportModule,
    MetaCapiModule,
    TikTokEventsModule,
    BlogModule,
    PageContentModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.LOG_LEVEL ??
          (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:HH:MM:ss',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
