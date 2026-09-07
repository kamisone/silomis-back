import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { extractIp } from '../common/utils/client-ip.util';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto, SubmitReviewSchema, VerifyOrderDto, VerifyOrderSchema } from './dto/review.dto';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

@Public()
@Controller('public/shop/reviews')
export class ReviewsPublicController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('verify-order')
  @HttpCode(200)
  verifyOrder(@Body(new ZodValidationPipe(VerifyOrderSchema)) dto: VerifyOrderDto) {
    return this.reviews.verifyOrder(dto);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(FilesInterceptor('media', 5, { limits: { fileSize: MAX_VIDEO_BYTES, files: 5 } }))
  submit(@Body(new ZodValidationPipe(SubmitReviewSchema)) dto: SubmitReviewDto, @UploadedFiles() files: Express.Multer.File[] = [], @Req() req: Request) {
    return this.reviews.submit(dto, files, { ip: extractIp(req), userAgent: req.headers['user-agent'] });
  }

  @Get('product/:productId')
  listForProduct(
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('lang') lang?: string,
  ) {
    return this.reviews.listForProduct(productId, limit ? parseInt(limit, 10) : undefined, offset ? parseInt(offset, 10) : undefined, lang);
  }

  @Get('product/:productId/stats')
  getStats(@Param('productId') productId: string) {
    return this.reviews.getStats(productId);
  }
}
