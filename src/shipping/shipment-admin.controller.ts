import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateShipmentDto, UpdateShipmentSchema, UpsertShipmentDto, UpsertShipmentSchema } from './dto/shipping.dto';

@Controller('admin/shop/shipments')
export class ShipmentAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('orderId') orderId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const take = limit ? parseInt(limit, 10) : 50;
    const skip = offset ? parseInt(offset, 10) : 0;
    const where = {
      ...(orderId ? { orderId } : {}),
      ...(status ? { status: status as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.shipment.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.shipment.count({ where }),
    ]);
    return { items, total };
  }

  @Post()
  create(@Body(new ZodValidationPipe(UpsertShipmentSchema)) dto: UpsertShipmentDto) {
    return this.prisma.shipment.create({ data: dto });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateShipmentSchema)) dto: UpdateShipmentDto) {
    return this.prisma.shipment.update({ where: { id }, data: dto });
  }
}
