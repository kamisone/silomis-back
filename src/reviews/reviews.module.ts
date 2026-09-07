import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { AntiSpamModule } from '../common/anti-spam/anti-spam.module';
import { TranslationsModule } from '../translations/translations.module';
import { ReviewsService } from './reviews.service';
import { ReviewsAdminController } from './reviews-admin.controller';
import { ReviewsPublicController } from './reviews-public.controller';

@Module({
  imports: [OrdersModule, GcsModule, AssetUrlModule, AntiSpamModule, TranslationsModule],
  providers: [ReviewsService],
  controllers: [ReviewsAdminController, ReviewsPublicController],
  exports: [ReviewsService],
})
export class ReviewsModule {}
