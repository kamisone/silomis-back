import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CustomerService } from './customer.service';
import {
  UpdateAddressDto,
  UpdateAddressSchema,
  UpsertAddressDto,
  UpsertAddressSchema,
} from './dto/customer.dto';
import { ShopBehaviorAnalyticsService } from '../analytics/shop-behavior-analytics.service';

@Controller('admin/shop/customers')
export class CustomerAdminController {
  constructor(
    private readonly customers: CustomerService,
    private readonly behaviorAnalytics: ShopBehaviorAnalyticsService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.customers.adminList(
      search,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  // Static route — must come before the `:id` route below.
  @Get('addresses')
  listAddresses(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.customers.adminListAddresses(
      search,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.customers.findById(id);
  }

  @Get(':id/timeline')
  getTimeline(@Param('id') id: string) {
    return this.behaviorAnalytics.getCustomerTimeline(id);
  }

  @Post(':id/addresses')
  addAddress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertAddressSchema)) dto: UpsertAddressDto,
  ) {
    return this.customers.addAddress(id, dto);
  }

  @Patch(':id/addresses/:addressId')
  updateAddress(
    @Param('addressId') addressId: string,
    @Body(new ZodValidationPipe(UpdateAddressSchema)) dto: UpdateAddressDto,
  ) {
    return this.customers.updateAddress(addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  deleteAddress(@Param('addressId') addressId: string) {
    return this.customers.deleteAddress(addressId);
  }
}
