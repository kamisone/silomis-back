import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InventoryService } from './inventory.service';
import { AdjustStockDto, AdjustStockSchema, BulkAdjustDto, BulkAdjustSchema, UpdateInventorySettingsDto, UpdateInventorySettingsSchema } from './dto/inventory.dto';

@Controller('admin/shop/inventory')
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryService) {}

  /** Enriched list — joined product/variant/option data for the admin inventory page. */
  @Get()
  list() {
    return this.inventory.listAllEnriched();
  }

  @Get(':variantId')
  getOne(@Param('variantId') variantId: string) {
    return this.inventory.getByVariant(variantId);
  }

  @Get(':variantId/movements')
  movements(@Param('variantId') variantId: string) {
    return this.inventory.getMovements(variantId);
  }

  @Post(':variantId/adjust')
  adjust(@Param('variantId') variantId: string, @Body(new ZodValidationPipe(AdjustStockSchema)) dto: AdjustStockDto) {
    return this.inventory.adjust(variantId, dto.delta, dto.note);
  }

  /** Update low-stock threshold or incoming quantity for a SKU. */
  @Patch(':variantId')
  updateSettings(@Param('variantId') variantId: string, @Body(new ZodValidationPipe(UpdateInventorySettingsSchema)) dto: UpdateInventorySettingsDto) {
    return this.inventory.updateSettings(variantId, dto);
  }

  /** Bulk stock adjustment — applied sequentially with per-item error isolation. */
  @Post('bulk-adjust')
  @HttpCode(200)
  bulkAdjust(@Body(new ZodValidationPipe(BulkAdjustSchema)) dto: BulkAdjustDto) {
    return this.inventory.bulkAdjust(dto.adjustments);
  }
}
