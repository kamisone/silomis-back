import { Module } from '@nestjs/common';
import { TranslationsModule } from '../translations/translations.module';
import { StoreBrandsService } from './store-brands.service';
import { StoreBrandsAdminController } from './store-brands-admin.controller';
import { StoreBrandsPublicController } from './store-brands-public.controller';

@Module({
  imports: [TranslationsModule],
  providers: [StoreBrandsService],
  controllers: [StoreBrandsAdminController, StoreBrandsPublicController],
  exports: [StoreBrandsService],
})
export class StoreBrandsModule {}
