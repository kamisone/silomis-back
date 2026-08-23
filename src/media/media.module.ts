import { Module } from '@nestjs/common';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
  imports: [GcsModule, AssetUrlModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
