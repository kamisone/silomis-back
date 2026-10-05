import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { extractIp } from '../common/utils/client-ip.util';
import { platformFromSource } from '../common/utils/traffic-source.util';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AddCartItemDto, AddCartItemSchema, PersonaliseCartItemDto, PersonaliseCartItemSchema } from '../personalization/dto/personalization.dto';
import { CartService } from './cart.service';

@Public()
@Controller('shop/cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get(':token')
  getCart(@Param('token') token: string, @Query('userId') userId?: string, @Query('lang') lang?: string) {
    return this.carts.getOrCreate(token, userId, lang);
  }

  /**
   * The whole body is validated here rather than pulled apart field by field,
   * because a personalised add carries a nested design that has to be the
   * right shape before the service starts resolving fonts and threads against
   * it. Plain adds are unaffected — `personalization` is optional.
   */
  @Post(':token/items')
  addItem(@Param('token') token: string, @Body(new ZodValidationPipe(AddCartItemSchema)) body: AddCartItemDto, @Query('lang') lang: string | undefined, @Req() req: Request) {
    return this.carts.addItem(token, body.variantId, body.quantity, body.selectedOptionValueIds, lang, { ip: extractIp(req), userAgent: req.headers['user-agent'], source: platformFromSource(body.referrer, body.utmSource) }, body.personalizations);
  }

  /** Embroider one unit of a plain line already in the basket. */
  @Post(':token/items/:itemId/personalise')
  personaliseItem(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(PersonaliseCartItemSchema)) body: PersonaliseCartItemDto,
    @Query('lang') lang: string | undefined,
  ) {
    return this.carts.personaliseItem(token, itemId, body.personalizations, lang);
  }

  /** The stored designs on a personalised line — reopened by the editor to change them. */
  @Get(':token/items/:itemId/personalise')
  getItemDesigns(@Param('token') token: string, @Param('itemId') itemId: string) {
    return this.carts.getItemDesigns(token, itemId);
  }

  /** Change the embroidery on a personalised line. */
  @Put(':token/items/:itemId/personalise')
  replaceItemDesign(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(PersonaliseCartItemSchema)) body: PersonaliseCartItemDto,
    @Query('lang') lang: string | undefined,
  ) {
    return this.carts.replaceItemDesign(token, itemId, body.personalizations, lang);
  }

  /** Take the embroidery off a line — it goes back to being the plain item. */
  @Delete(':token/items/:itemId/personalise')
  removeItemDesign(@Param('token') token: string, @Param('itemId') itemId: string, @Query('lang') lang: string | undefined) {
    return this.carts.removeItemDesign(token, itemId, lang);
  }

  @Put(':token/items/:itemId')
  updateItem(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @Body('quantity') quantity: number,
    @Body('referrer') referrer: string | undefined,
    @Body('utmSource') utmSource: string | undefined,
    @Query('lang') lang: string | undefined,
    @Req() req: Request,
  ) {
    return this.carts.updateItem(token, itemId, quantity, lang, { ip: extractIp(req), userAgent: req.headers['user-agent'], source: platformFromSource(referrer, utmSource) });
  }

  @Delete(':token/items/:itemId')
  removeItem(@Param('token') token: string, @Param('itemId') itemId: string, @Query('lang') lang: string | undefined, @Req() req: Request) {
    return this.carts.removeItem(token, itemId, lang, { ip: extractIp(req), userAgent: req.headers['user-agent'] });
  }
}
