import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RateLimit } from '../common/throttling/rate-limit.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OrdersService } from './orders.service';
import { OrderAccessService } from './order-access.service';
import { CreateOrderDto, CreateOrderSchema } from './dto/order.dto';
import {
  OrderAccessLinkDto,
  OrderAccessLinkSchema,
  OrderSessionDto,
  OrderSessionSchema,
} from './dto/order-access.dto';
import { OrderAccessLevel } from './order-access.constants';

/**
 * Looser than the contact form's: a customer legitimately reloads a tracking
 * page, and this is counted per visitor rather than per proxy socket.
 */
const ORDER_ACCESS_LIMIT = [20, 15] as const;

/** Header the BFF replays a stored grant on. */
const GRANT_HEADER = 'x-order-grant';

@Public()
@Controller('shop/orders')
export class OrdersPublicController {
  constructor(
    private readonly orders: OrdersService,
    private readonly access: OrderAccessService,
  ) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto) {
    return this.orders.createFromCart(dto);
  }

  @Get(':orderNumber/track')
  @RateLimit(...ORDER_ACCESS_LIMIT)
  async track(
    @Param('orderNumber') orderNumber: string,
    @Headers(GRANT_HEADER) rawGrant?: string,
    @Query('token') token?: string,
    @Query('email') email?: string,
    @Query('lang') lang?: string,
  ) {
    const grant = this.access.verifyGrant(rawGrant);
    if (!token && !email && !grant)
      throw new NotFoundException('Order not found');

    const tracking = await this.orders.trackOrder(
      orderNumber,
      { token, email, grantedOrderId: grant?.orderId },
      lang,
    );

    // trackOrder throws unless the credential matched, so by this line a
    // `token` has been proven and earns `full`; a bare email earns `status`.
    // Returned with the order so the page knows whether the conversation is
    // open to this visitor without a second round trip.
    const accessLevel: OrderAccessLevel =
      grant?.level ?? (token ? 'full' : 'status');
    return { ...tracking, accessLevel };
  }

  /**
   * Exchanges a credential for a grant the BFF stores in an httpOnly cookie.
   *
   * This is what takes the customer's email address out of the tracking page's
   * URL, where it used to be re-sent on every navigation and swept up by
   * history, referrers and this shop's own session replay.
   *
   * 404 — never 401 or 403 — for a wrong credential *and* for an order that
   * does not exist, so the endpoint cannot be walked to discover which of the
   * sequential order numbers are real.
   */
  @Post(':orderNumber/session')
  @HttpCode(200)
  @RateLimit(...ORDER_ACCESS_LIMIT)
  async session(
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(OrderSessionSchema)) dto: OrderSessionDto,
  ) {
    if (!dto.token && !dto.email)
      throw new NotFoundException('Order not found');
    const grant = await this.access.issueGrant(orderNumber, dto);
    if (!grant) throw new NotFoundException('Order not found');
    return grant;
  }

  /**
   * Emails the order's secure link to the address on the order.
   *
   * Always 204, whatever happened — see OrderAccessService.sendAccessLink for
   * why the answer must not depend on the outcome.
   */
  @Post(':orderNumber/access-link')
  @HttpCode(204)
  @RateLimit(...ORDER_ACCESS_LIMIT)
  async accessLink(
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(OrderAccessLinkSchema)) dto: OrderAccessLinkDto,
    @Headers(GRANT_HEADER) rawGrant?: string,
  ): Promise<void> {
    const grant = this.access.verifyGrant(rawGrant);
    await this.access.sendAccessLink(orderNumber, {
      email: dto.email,
      verifiedOrderId:
        grant?.orderNumber === orderNumber ? grant.orderId : undefined,
    });
  }
}
