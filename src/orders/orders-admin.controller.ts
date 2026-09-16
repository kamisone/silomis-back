import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatus } from '../../generated/prisma/client';

@Controller('admin/shop/orders')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('status') status?: string, @Query('search') search?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.orders.adminList({
      status,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.orders.findById(id);
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body('status') status: OrderStatus, @Body('note') note?: string) {
    // Marking an order paid by hand (a bank transfer, cash at the counter) is
    // a payment like any other: the customer's confirmation, the invoice and
    // the desk's alert all hang off the payment event, not off the status.
    if (status === 'paid') return this.orders.markPaidManually(id, note);
    return this.orders.transition(id, status, note);
  }
}
