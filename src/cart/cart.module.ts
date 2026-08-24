import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { TranslationsModule } from '../translations/translations.module';
import { EmailModule } from '../email/email.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { DlqModule } from '../dlq/dlq.module';
import { AnalyticsTrackingModule } from '../analytics-tracking/analytics-tracking.module';
import { MetaCapiModule } from '../marketing/meta-capi/meta-capi.module';
import { TikTokEventsModule } from '../marketing/tiktok-events/tiktok-events.module';
import { CART_ABANDONMENT_QUEUE } from './cart-abandonment.constants';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { CartAdminController } from './cart-admin.controller';
import { CartAbandonmentProcessor } from './cart-abandonment.processor';
import { CartCheckoutCompletionListener } from './cart-checkout-completion.listener';

@Module({
  imports: [
    AssetUrlModule,
    TranslationsModule,
    EmailModule,
    CheckoutModule,
    DlqModule,
    AnalyticsTrackingModule,
    MetaCapiModule,
    TikTokEventsModule,
    BullModule.registerQueue({ name: CART_ABANDONMENT_QUEUE }),
  ],
  controllers: [CartController, CartAdminController],
  providers: [
    CartService,
    CartAbandonmentProcessor,
    CartCheckoutCompletionListener,
  ],
  exports: [CartService],
})
export class CartModule {}
