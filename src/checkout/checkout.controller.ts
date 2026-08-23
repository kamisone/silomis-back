import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CheckoutService } from './checkout.service';
import { CheckoutSessionService } from './checkout-session.service';
import { InitiateCheckoutDto, InitiateCheckoutSchema, UpsertCheckoutSessionDto, UpsertCheckoutSessionSchema } from './dto/checkout.dto';
import { UpdateShippingDto, UpdateShippingSchema } from '../shipping/dto/shipping.dto';

@Public()
@Controller('shop/checkout')
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly sessionService: CheckoutSessionService,
  ) {}

  // ── Checkout session (persistent form state + resume support) ─────────

  @Get('session')
  getSession(@Query('cartToken') cartToken: string, @Query('locale') locale: string) {
    if (!cartToken) throw new BadRequestException('cartToken is required');
    return this.sessionService.findOrCreate(cartToken, locale || 'fr');
  }

  @Put('session')
  @HttpCode(200)
  upsertSession(@Body(new ZodValidationPipe(UpsertCheckoutSessionSchema)) dto: UpsertCheckoutSessionDto) {
    return this.sessionService.upsert(dto);
  }

  @Get('resume/:resumeToken')
  getByResumeToken(@Param('resumeToken', ParseUUIDPipe) resumeToken: string) {
    return this.sessionService.findByResumeToken(resumeToken);
  }

  // ── Core checkout flow ──────────────────────────────────────────────────

  /** Validates the cart, computes server-side totals, creates a draft order, reserves inventory. */
  @Post()
  @HttpCode(201)
  initiate(@Body(new ZodValidationPipe(InitiateCheckoutSchema)) dto: InitiateCheckoutDto) {
    return this.checkoutService.initiate(dto);
  }

  /**
   * Authoritative coupon preview for the checkout address step. Declared
   * before the `:orderId` route below — Nest matches routes in declaration
   * order, so this static path must come first or it would never be reached.
   */
  @Get('validate-coupon')
  validateCoupon(@Query('code') code: string, @Query('cartToken') cartToken: string) {
    if (!code || !cartToken) throw new BadRequestException('code and cartToken are required');
    return this.checkoutService.validateCoupon(code, cartToken);
  }

  /** Returns the current checkout snapshot — used on page reload / resume. */
  @Get(':orderId')
  getSnapshot(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.checkoutService.getSnapshot(orderId);
  }

  /** Selects a shipping method for the order — editable while draft or awaiting_payment. */
  @Patch(':orderId/shipping')
  @HttpCode(200)
  updateShipping(@Param('orderId', ParseUUIDPipe) orderId: string, @Body(new ZodValidationPipe(UpdateShippingSchema)) dto: UpdateShippingDto) {
    return this.checkoutService.updateShipping(orderId, dto);
  }

  /**
   * Transitions draft → awaiting_payment. The next step — creating a Stripe
   * PaymentIntent — is wired up alongside the Payments domain; this endpoint
   * is the hook that step attaches to.
   */
  @Post(':orderId/ready-for-payment')
  @HttpCode(200)
  readyForPayment(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.checkoutService.readyForPayment(orderId);
  }
}
