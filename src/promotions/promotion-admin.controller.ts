import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TranslationService } from '../ai/translation.service';
import { ShopPromotionService } from './shop-promotion.service';
import {
  AddCategoryLinkDto,
  AddCategoryLinkSchema,
  AddProductLinkDto,
  AddProductLinkSchema,
  CreatePromotionDto,
  CreatePromotionSchema,
  UpdatePromotionDto,
  UpdatePromotionSchema,
} from './dto/promotion.dto';
import { PromotionScope, PromotionTrigger } from '../../generated/prisma/client';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(500) });

@Controller('admin/shop/promotions')
export class PromotionAdminController {
  constructor(
    private readonly promotions: ShopPromotionService,
    private readonly translation: TranslationService,
  ) {}

  // ── AI translation ─────────────────────────────────────────────────────
  // The admin writes the base copy, then clicks "Generate" to fill every
  // other language in one shot. Mirrors the products/countries endpoints.

  @Post('sections/name/translate')
  translateNameSection(
    @Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>,
  ) {
    return this.translation.translatePromotionName(dto.text);
  }

  @Post('sections/description/translate')
  translateDescriptionSection(
    @Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>,
  ) {
    return this.translation.translatePromotionDescription(dto.text);
  }

  @Get()
  list(
    @Query('trigger') trigger?: PromotionTrigger,
    @Query('scope') scope?: PromotionScope,
    @Query('isActive') isActive?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.promotions.list({
      trigger,
      scope,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotions.findOneWithLinks(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreatePromotionSchema)) dto: CreatePromotionDto) {
    return this.promotions.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdatePromotionSchema)) dto: UpdatePromotionDto) {
    return this.promotions.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.promotions.remove(id);
  }

  @Get(':id/category-links')
  listCategoryLinks(@Param('id') id: string) {
    return this.promotions.listCategoryLinks(id);
  }

  @Post(':id/category-links')
  @HttpCode(201)
  addCategoryLink(@Param('id') id: string, @Body(new ZodValidationPipe(AddCategoryLinkSchema)) dto: AddCategoryLinkDto) {
    return this.promotions.addCategoryLink(id, dto.categoryId);
  }

  @Delete(':id/category-links/:linkId')
  @HttpCode(204)
  removeCategoryLink(@Param('id') id: string, @Param('linkId') linkId: string) {
    return this.promotions.removeCategoryLink(id, linkId);
  }

  @Get(':id/product-links')
  listProductLinks(@Param('id') id: string) {
    return this.promotions.listProductLinks(id);
  }

  @Post(':id/product-links')
  @HttpCode(201)
  addProductLink(@Param('id') id: string, @Body(new ZodValidationPipe(AddProductLinkSchema)) dto: AddProductLinkDto) {
    return this.promotions.addProductLink(id, dto.productId);
  }

  @Delete(':id/product-links/:linkId')
  @HttpCode(204)
  removeProductLink(@Param('id') id: string, @Param('linkId') linkId: string) {
    return this.promotions.removeProductLink(id, linkId);
  }
}
