import { Controller, Get, HttpCode, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/public.decorator';
import { SendInService } from './send-in.service';
import { SEND_IN_PHOTO_MAX, SEND_IN_PHOTO_MAX_BYTES } from './send-in.constants';

@Public()
@Controller('shop/send-in')
export class SendInController {
  constructor(private readonly sendIn: SendInService) {}

  /** The service as offered, or `{ available: false }` when it is switched off. */
  @Get('config')
  async config(@Query('lang') lang?: string) {
    return (await this.sendIn.config(lang)) ?? { available: false };
  }

  /**
   * The customer's photographs of their item. Stored before the design is
   * made, because the editor draws on them; a design that never becomes an
   * order leaves an orphan file, which is a far better trade than making a
   * customer re-upload after every edit.
   */
  @Post('photos')
  @HttpCode(201)
  @UseInterceptors(FilesInterceptor('photos', SEND_IN_PHOTO_MAX, { limits: { fileSize: SEND_IN_PHOTO_MAX_BYTES, files: SEND_IN_PHOTO_MAX } }))
  upload(@UploadedFiles() files: Express.Multer.File[] = []) {
    return this.sendIn.uploadPhotos(files);
  }
}
