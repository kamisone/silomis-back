import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

interface UpsertGroupDto {
  name: string;
  description?: string | null;
  criteria?: Prisma.InputJsonValue | null;
  isActive?: boolean;
}

@Controller('admin/shop/customers/groups')
export class CustomerGroupAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('limit') limit = '50', @Query('offset') offset = '0') {
    const [items, total] = await Promise.all([
      this.prisma.shopCustomerGroup.findMany({ orderBy: { name: 'asc' }, take: parseInt(limit, 10), skip: parseInt(offset, 10) }),
      this.prisma.shopCustomerGroup.count(),
    ]);
    return { items, total };
  }

  @Post()
  create(@Body() dto: UpsertGroupDto) {
    return this.prisma.shopCustomerGroup.create({ data: dto });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertGroupDto>) {
    return this.prisma.shopCustomerGroup.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.prisma.shopCustomerGroup.delete({ where: { id } });
  }
}
