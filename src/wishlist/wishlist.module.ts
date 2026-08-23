import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { WishlistService } from './wishlist.service';
import { WishlistPublicController } from './wishlist-public.controller';
import { WishlistAdminController } from './wishlist-admin.controller';
import { BackInStockListener } from './back-in-stock.listener';

@Module({
  imports: [EmailModule],
  providers: [WishlistService, BackInStockListener],
  controllers: [WishlistPublicController, WishlistAdminController],
  exports: [WishlistService],
})
export class WishlistModule {}
