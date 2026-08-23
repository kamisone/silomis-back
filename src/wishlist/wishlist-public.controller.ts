import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { WishlistService } from './wishlist.service';

/**
 * Public/guest-facing — silomis has no customer account/login system today
 * (only admin auth exists), so userId is always null in practice; the field
 * is kept end-to-end so this works unmodified once customer accounts exist.
 */
@Public()
@Controller('public/shop/wishlist')
export class WishlistPublicController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@Query('sessionToken') sessionToken?: string, @Query('userId') userId?: string) {
    return this.wishlist.list(sessionToken ?? null, userId ?? null);
  }

  @Post()
  add(@Body('sessionToken') sessionToken: string | undefined, @Body('userId') userId: string | undefined, @Body('productId') productId: string, @Body('variantId') variantId?: string) {
    return this.wishlist.add(sessionToken ?? null, userId ?? null, productId, variantId ?? null);
  }

  @Delete(':productId')
  remove(@Param('productId') productId: string, @Query('sessionToken') sessionToken?: string, @Query('userId') userId?: string) {
    return this.wishlist.remove(sessionToken ?? null, userId ?? null, productId);
  }

  @Post('merge')
  merge(@Body('sessionToken') sessionToken: string, @Body('userId') userId: string) {
    return this.wishlist.mergeGuestToUser(sessionToken, userId);
  }
}
