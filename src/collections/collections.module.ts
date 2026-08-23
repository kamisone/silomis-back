import { Module } from '@nestjs/common';
import { TranslationsModule } from '../translations/translations.module';
import { CollectionsService } from './collections.service';
import { CollectionsAdminController } from './collections-admin.controller';
import { CollectionsPublicController } from './collections-public.controller';

@Module({
  imports: [TranslationsModule],
  providers: [CollectionsService],
  controllers: [CollectionsAdminController, CollectionsPublicController],
  exports: [CollectionsService],
})
export class CollectionsModule {}
