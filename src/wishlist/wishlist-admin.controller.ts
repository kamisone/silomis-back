import { Controller, Get, Query } from '@nestjs/common';
import { WishlistService } from './wishlist.service';

@Controller('admin/shop/wishlists')
export class WishlistAdminController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get('most-wishlisted')
  mostWishlisted(@Query('limit') limit?: string) {
    return this.wishlist.getMostWishlisted(limit ? parseInt(limit, 10) : undefined);
  }

  @Get('non-converting')
  nonConverting(@Query('limit') limit?: string) {
    return this.wishlist.getNonConvertingWishlist(limit ? parseInt(limit, 10) : undefined);
  }
}
