import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TranslationService } from '../../ai/translation.service';
import { CategoryFiltersService } from './category-filters.service';
import {
  CreateCategoryFilterDto,
  CreateCategoryFilterSchema,
  CreateFilterValueDto,
  CreateFilterValueSchema,
  UpdateCategoryFilterDto,
  UpdateCategoryFilterSchema,
  UpdateFilterValueDto,
  UpdateFilterValueSchema,
} from './dto/category-filter.dto';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(200) });

@Controller('admin/shop')
export class CategoryFiltersAdminController {
  constructor(
    private readonly filters: CategoryFiltersService,
    private readonly translation: TranslationService,
  ) {}

  @Get('categories/:categoryId/filters')
  findAllForCategory(@Param('categoryId') categoryId: string) {
    return this.filters.findAllForCategory(categoryId);
  }

  @Post('categories/:categoryId/filters')
  create(@Param('categoryId') categoryId: string, @Body(new ZodValidationPipe(CreateCategoryFilterSchema)) dto: CreateCategoryFilterDto) {
    return this.filters.createFilter(categoryId, dto);
  }

  @Patch('category-filters/:id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateCategoryFilterSchema)) dto: UpdateCategoryFilterDto) {
    return this.filters.updateFilter(id, dto);
  }

  @Delete('category-filters/:id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.filters.deleteFilter(id);
  }

  // ── Values ───────────────────────────────────────────────────────────

  @Post('category-filters/:id/values')
  addValue(@Param('id') filterId: string, @Body(new ZodValidationPipe(CreateFilterValueSchema)) dto: CreateFilterValueDto) {
    return this.filters.addValue(filterId, dto);
  }

  @Patch('category-filters/:id/values/:valueId')
  updateValue(@Param('valueId') valueId: string, @Body(new ZodValidationPipe(UpdateFilterValueSchema)) dto: UpdateFilterValueDto) {
    return this.filters.updateValue(valueId, dto);
  }

  @Delete('category-filters/:id/values/:valueId')
  @HttpCode(204)
  removeValue(@Param('valueId') valueId: string) {
    return this.filters.deleteValue(valueId);
  }

  // ── AI translate ────────────────────────────────────────────────────────

  @Post('category-filters/sections/name/translate')
  translateNameSection(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateCategoryFilterName(dto.text);
  }

  @Post('category-filters/sections/label/translate')
  translateLabelSection(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateCategoryFilterValueLabel(dto.text);
  }
}
