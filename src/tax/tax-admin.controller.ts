import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TaxService } from './tax.service';
import { CreateTaxRateDto, CreateTaxRateSchema, UpdateTaxRateDto, UpdateTaxRateSchema } from './dto/tax-rate.dto';

@Controller('admin/shop/tax-rates')
export class TaxAdminController {
  constructor(private readonly tax: TaxService) {}

  @Get()
  list() {
    return this.tax.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tax.findOne(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateTaxRateSchema)) dto: CreateTaxRateDto) {
    return this.tax.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateTaxRateSchema)) dto: UpdateTaxRateDto) {
    return this.tax.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.tax.remove(id);
  }
}
