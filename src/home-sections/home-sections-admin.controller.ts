import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TranslationService } from '../ai/translation.service';
import { HomeSectionsService } from './home-sections.service';
import {
  CreateHomeSectionDto,
  CreateHomeSectionSchema,
  ReorderHomeSectionsDto,
  ReorderHomeSectionsSchema,
  UpdateHomeSectionDto,
  UpdateHomeSectionSchema,
} from './dto/home-section.dto';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(2000) });
const TranslateHtmlSchema = z.object({ html: z.string().min(1).max(50000) });

@Controller('admin/shop/home-sections')
export class HomeSectionsAdminController {
  constructor(
    private readonly sections: HomeSectionsService,
    private readonly translation: TranslationService,
  ) {}

  // ── AI translation ─────────────────────────────────────────────────────
  // The editorial blocks keep their copy inside the section's JSON, so unlike
  // the product endpoints there is no field to name — the admin writes the
  // English of whichever field they are in and asks for the other six.

  @Post('sections/text/translate')
  translateText(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateCopy(dto.text);
  }

  @Post('sections/html/translate')
  translateHtml(@Body(new ZodValidationPipe(TranslateHtmlSchema)) dto: z.infer<typeof TranslateHtmlSchema>) {
    return this.translation.translateCopyHtml(dto.html);
  }

  @Get()
  list() {
    return this.sections.adminList();
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateHomeSectionSchema)) dto: CreateHomeSectionDto) {
    return this.sections.create(dto);
  }

  @Patch('reorder')
  reorder(@Body(new ZodValidationPipe(ReorderHomeSectionsSchema)) dto: ReorderHomeSectionsDto) {
    return this.sections.reorder(dto.ids);
  }

  @Post('restore-defaults')
  restoreDefaults() {
    return this.sections.restoreDefaults();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateHomeSectionSchema)) dto: UpdateHomeSectionDto) {
    return this.sections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.sections.remove(id);
  }
}
