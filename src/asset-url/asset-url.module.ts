import { Global, Module } from '@nestjs/common';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlService } from './asset-url.service';

/**
 * @Global so every module can inject AssetUrlService without an explicit import.
 * Same pattern as RedisModule in this codebase.
 */
@Global()
@Module({
  imports: [GcsModule],
  providers: [AssetUrlService],
  exports: [AssetUrlService],
})
export class AssetUrlModule {}
