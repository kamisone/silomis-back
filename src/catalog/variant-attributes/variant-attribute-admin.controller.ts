import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TranslationService } from '../../ai/translation.service';
import { VariantAttributesService } from './variant-attributes.service';
import {
  CreateOptionValueDto,
  CreateOptionValueSchema,
  CreateVariantAttributeDto,
  CreateVariantAttributeSchema,
  UpdateOptionValueDto,
  UpdateOptionValueSchema,
  UpdateVariantAttributeDto,
  UpdateVariantAttributeSchema,
} from './dto/variant-attribute.dto';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(200) });

@Controller('admin/shop/variant-attributes')
export class VariantAttributeAdminController {
  constructor(
    private readonly attributes: VariantAttributesService,
    private readonly translation: TranslationService,
  ) {}

  @Get()
  findAll() {
    return this.attributes.findAll();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateVariantAttributeSchema))
    dto: CreateVariantAttributeDto,
  ) {
    return this.attributes.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVariantAttributeSchema))
    dto: UpdateVariantAttributeDto,
  ) {
    return this.attributes.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.attributes.remove(id);
  }

  // ── AI translate ────────────────────────────────────────────────────────

  @Post('sections/name/translate')
  translateNameSection(
    @Body(new ZodValidationPipe(TranslateTextSchema))
    dto: z.infer<typeof TranslateTextSchema>,
  ) {
    return this.translation.translateAttributeName(dto.text);
  }

  @Post('sections/display-value/translate')
  translateDisplayValueSection(
    @Body(new ZodValidationPipe(TranslateTextSchema))
    dto: z.infer<typeof TranslateTextSchema>,
  ) {
    return this.translation.translateOptionDisplayValue(dto.text);
  }

  // ── Option values ───────────────────────────────────────────────────────

  @Post(':id/values')
  addValue(
    @Param('id') attributeId: string,
    @Body(new ZodValidationPipe(CreateOptionValueSchema))
    dto: CreateOptionValueDto,
  ) {
    return this.attributes.addValue(attributeId, dto);
  }

  @Patch(':id/values/:valueId')
  updateValue(
    @Param('valueId') valueId: string,
    @Body(new ZodValidationPipe(UpdateOptionValueSchema))
    dto: UpdateOptionValueDto,
  ) {
    return this.attributes.updateValue(valueId, dto);
  }

  @Delete(':id/values/:valueId')
  @HttpCode(204)
  removeValue(@Param('valueId') valueId: string) {
    return this.attributes.removeValue(valueId);
  }
}
