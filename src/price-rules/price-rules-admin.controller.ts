import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PriceRulesService } from './price-rules.service';
import { CreatePriceRuleDto, CreatePriceRuleSchema, UpdatePriceRuleDto, UpdatePriceRuleSchema } from './dto/price-rule.dto';

@Controller('admin/shop/price-rules')
export class PriceRulesAdminController {
  constructor(private readonly priceRules: PriceRulesService) {}

  @Get()
  list(@Query('scope') scope?: string, @Query('isActive') isActive?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.priceRules.list({
      scope,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.priceRules.findOne(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreatePriceRuleSchema)) dto: CreatePriceRuleDto) {
    return this.priceRules.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdatePriceRuleSchema)) dto: UpdatePriceRuleDto) {
    return this.priceRules.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.priceRules.remove(id);
  }
}
