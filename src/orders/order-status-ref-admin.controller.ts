import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UpsertStatusRefDto {
  code: string;
  label: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

@Controller('admin/shop/order-status-refs')
export class OrderStatusRefAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.orderStatusRef.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  }

  @Post()
  create(@Body() dto: UpsertStatusRefDto) {
    return this.prisma.orderStatusRef.create({ data: dto });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<UpsertStatusRefDto>) {
    const ref = await this.prisma.orderStatusRef.findUnique({ where: { id } });
    if (!ref) throw new NotFoundException('Order status ref not found');
    return this.prisma.orderStatusRef.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    const ref = await this.prisma.orderStatusRef.findUnique({ where: { id } });
    if (!ref) throw new NotFoundException('Order status ref not found');
    await this.prisma.orderStatusRef.delete({ where: { id } });
  }
}
