import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { extractIp } from '../common/utils/client-ip.util';
import { ShippingService } from './shipping.service';
import { ShippingDestinationService } from './shipping-destination.service';
import {
  UpdateMethodDto,
  UpdateMethodSchema,
  UpdateZoneDto,
  UpdateZoneSchema,
  UpsertMethodDto,
  UpsertMethodSchema,
  UpsertZoneDto,
  UpsertZoneSchema,
} from './dto/shipping.dto';

@Public()
@Controller('public/shop/shipping')
export class ShippingPublicController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly destination: ShippingDestinationService,
  ) {}

  /**
   * Where this visitor's order would ship, for the header strip. Answered per
   * visitor from their IP, so the page itself stays cacheable and the browser
   * asks once. `country` is the destination the visitor already picked at
   * checkout, preferred over the IP when the shop serves it.
   */
  @Get('destination')
  @Header('Cache-Control', 'private, no-store')
  getDestination(@Req() req: Request, @Query('country') country?: string) {
    return this.destination.resolve(extractIp(req), country);
  }

  @Get('methods')
  getMethods(@Query('country') country: string, @Query('subtotal') subtotal: string, @Query('lang') lang?: string) {
    return this.shipping.getMethodsForCountry(country, subtotal ? parseInt(subtotal, 10) : 0, lang);
  }

  @Get('overview')
  getOverview(@Query('lang') lang?: string) {
    return this.shipping.getOverview(lang);
  }
}

@Controller('admin/shop/shipping')
export class ShippingAdminController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('zones')
  listZones() {
    return this.shipping.listZones();
  }

  @Post('zones')
  createZone(@Body(new ZodValidationPipe(UpsertZoneSchema)) dto: UpsertZoneDto) {
    return this.shipping.createZone(dto);
  }

  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateZoneSchema)) dto: UpdateZoneDto) {
    return this.shipping.updateZone(id, dto);
  }

  @Delete('zones/:id')
  @HttpCode(204)
  deleteZone(@Param('id') id: string) {
    return this.shipping.deleteZone(id);
  }

  @Get('methods')
  listMethods(@Query('zoneId') zoneId?: string) {
    return this.shipping.listMethods(zoneId);
  }

  /** Feeds the product form's "Shipping methods" checkbox list. */
  @Get('product-opt-in-methods')
  listProductOptInMethods() {
    return this.shipping.listProductOptInMethods();
  }

  @Get('free-shipping-methods')
  listFreeShippingUpgradeMethods() {
    return this.shipping.listFreeShippingUpgradeMethods();
  }

  @Post('methods')
  createMethod(@Body(new ZodValidationPipe(UpsertMethodSchema)) dto: UpsertMethodDto) {
    return this.shipping.createMethod(dto);
  }

  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateMethodSchema)) dto: UpdateMethodDto) {
    return this.shipping.updateMethod(id, dto);
  }

  @Delete('methods/:id')
  @HttpCode(204)
  deleteMethod(@Param('id') id: string) {
    return this.shipping.deleteMethod(id);
  }
}
