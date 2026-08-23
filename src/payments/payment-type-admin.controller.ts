import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UpsertPaymentTypeDto {
  code: string;
  name: string;
  iconKey?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

@Controller('admin/shop/payment-types')
export class PaymentTypeAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.paymentType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  @Post()
  create(@Body() dto: UpsertPaymentTypeDto) {
    return this.prisma.paymentType.create({ data: dto });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertPaymentTypeDto>) {
    return this.prisma.paymentType.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.prisma.paymentType.delete({ where: { id } });
  }
}
