import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReviewsService } from './reviews.service';
import {
  AdminCreateReviewDto,
  AdminCreateReviewSchema,
  AdminUpdateReviewDto,
  AdminUpdateReviewSchema,
  ModerateReviewDto,
  ModerateReviewSchema,
} from './dto/review.dto';
import { ReviewStatus } from '../../generated/prisma/client';

interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

@Controller('admin/shop/reviews')
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query('status') status?: ReviewStatus, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.reviews.adminList(status, limit ? parseInt(limit, 10) : undefined, offset ? parseInt(offset, 10) : undefined);
  }

  /** Enter a review copied from a supplier listing. See ReviewsService.adminCreate. */
  @Post()
  create(@Body(new ZodValidationPipe(AdminCreateReviewSchema)) dto: AdminCreateReviewDto) {
    return this.reviews.adminCreate(dto);
  }

  @Patch(':id/moderate')
  moderate(@Param('id') id: string, @Body(new ZodValidationPipe(ModerateReviewSchema)) dto: ModerateReviewDto, @Req() req: AuthedRequest) {
    return this.reviews.moderate(id, dto, req.user?.email ?? 'admin');
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(AdminUpdateReviewSchema)) dto: AdminUpdateReviewDto) {
    return this.reviews.adminUpdate(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.reviews.adminDelete(id);
  }
}
