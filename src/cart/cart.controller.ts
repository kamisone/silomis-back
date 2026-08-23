import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { extractIp } from '../common/utils/client-ip.util';
import { CartService } from './cart.service';

@Public()
@Controller('shop/cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get(':token')
  getCart(@Param('token') token: string, @Query('userId') userId?: string, @Query('lang') lang?: string) {
    return this.carts.getOrCreate(token, userId, lang);
  }

  @Post(':token/items')
  addItem(@Param('token') token: string, @Body('variantId') variantId: string, @Body('quantity') quantity: number, @Body('selectedOptionValueIds') selectedOptionValueIds: string[] | undefined, @Query('lang') lang: string | undefined, @Req() req: Request) {
    return this.carts.addItem(token, variantId, quantity, selectedOptionValueIds, lang, { ip: extractIp(req), userAgent: req.headers['user-agent'] });
  }

  @Put(':token/items/:itemId')
  updateItem(@Param('token') token: string, @Param('itemId') itemId: string, @Body('quantity') quantity: number, @Query('lang') lang: string | undefined, @Req() req: Request) {
    return this.carts.updateItem(token, itemId, quantity, lang, { ip: extractIp(req), userAgent: req.headers['user-agent'] });
  }

  @Delete(':token/items/:itemId')
  removeItem(@Param('token') token: string, @Param('itemId') itemId: string, @Query('lang') lang: string | undefined, @Req() req: Request) {
    return this.carts.removeItem(token, itemId, lang, { ip: extractIp(req), userAgent: req.headers['user-agent'] });
  }
}
