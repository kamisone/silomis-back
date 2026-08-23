import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { NewsletterService } from './newsletter.service';
import {
  BulkSubscriberActionDto,
  BulkSubscriberActionSchema,
  CreateSubscriberAdminDto,
  CreateSubscriberAdminSchema,
  UpdateSubscriberDto,
  UpdateSubscriberSchema,
} from './dto/subscriber.dto';
import { NewsletterSubscriberStatus } from '../../generated/prisma/client';

@Controller('admin/newsletter/subscribers')
export class NewsletterAdminController {
  constructor(private readonly service: NewsletterService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: NewsletterSubscriberStatus,
    @Query('locale') locale?: string,
    @Query('source') source?: string,
    @Query('tag') tag?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.adminList({
      search,
      status,
      locale,
      source,
      tag,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // Static route — must come before any future `:id` GET route.
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="subscribers.csv"')
  async export(
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('status') status?: NewsletterSubscriberStatus,
    @Query('locale') locale?: string,
    @Query('source') source?: string,
    @Query('tag') tag?: string,
  ) {
    const csv = await this.service.exportCsv({
      search,
      status,
      locale,
      source,
      tag,
    });
    res.send(csv);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateSubscriberAdminSchema))
    dto: CreateSubscriberAdminDto,
  ) {
    return this.service.createManual(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSubscriberSchema))
    dto: UpdateSubscriberDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('bulk')
  bulk(
    @Body(new ZodValidationPipe(BulkSubscriberActionSchema))
    dto: BulkSubscriberActionDto,
  ) {
    return this.service.bulkAction(dto);
  }
}
