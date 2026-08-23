import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReturnsService } from './returns.service';
import { CreateReturnRequestDto, CreateReturnRequestSchema, TransitionReturnRequestDto, TransitionReturnRequestSchema } from './dto/return.dto';
import { ReturnStatus } from '../../generated/prisma/client';

interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

@Controller('admin/shop/returns')
export class ReturnsAdminController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(@Query('status') status?: ReturnStatus, @Query('orderId') orderId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.returns.list({
      status,
      orderId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returns.findOne(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateReturnRequestSchema)) dto: CreateReturnRequestDto) {
    return this.returns.create(dto);
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body(new ZodValidationPipe(TransitionReturnRequestSchema)) dto: TransitionReturnRequestDto, @Req() req: AuthedRequest) {
    return this.returns.transition(id, dto.status, dto.note ?? undefined, req.user?.id);
  }
}
