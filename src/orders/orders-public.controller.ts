import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OrdersService } from './orders.service';
import { CreateOrderDto, CreateOrderSchema } from './dto/order.dto';

@Public()
@Controller('shop/orders')
export class OrdersPublicController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto) {
    return this.orders.createFromCart(dto);
  }

  @Get(':orderNumber')
  getByNumber(@Param('orderNumber') orderNumber: string) {
    return this.orders.findByNumber(orderNumber);
  }

  @Get(':orderNumber/track')
  track(@Param('orderNumber') orderNumber: string, @Query('token') token?: string, @Query('email') email?: string, @Query('lang') lang?: string) {
    if (!token && !email) throw new NotFoundException('Order not found');
    return this.orders.trackOrder(orderNumber, { token, email }, lang);
  }
}
