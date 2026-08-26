import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TranslationService } from '../ai/translation.service';
import { HeroSlidesService } from './hero-slides.service';
import {
  CreateHeroSlideDto,
  CreateHeroSlideSchema,
  ReorderHeroSlidesDto,
  ReorderHeroSlidesSchema,
  UpdateHeroSlideDto,
  UpdateHeroSlideSchema,
} from './dto/hero-slide.dto';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(2000) });

@Controller('admin/shop/hero-slides')
export class HeroSlidesAdminController {
  constructor(
    private readonly slides: HeroSlidesService,
    private readonly translation: TranslationService,
  ) {}

  // ── AI translation ─────────────────────────────────────────────────────
  // Every slide field is ordinary copy — eyebrow, title, subtitle, a button
  // label — so one endpoint serves them all. English in, the other six out.

  @Post('sections/text/translate')
  translateText(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateCopy(dto.text);
  }

  @Get()
  list() {
    return this.slides.adminList();
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateHeroSlideSchema)) dto: CreateHeroSlideDto) {
    return this.slides.create(dto);
  }

  @Patch('reorder')
  reorder(@Body(new ZodValidationPipe(ReorderHeroSlidesSchema)) dto: ReorderHeroSlidesDto) {
    return this.slides.reorder(dto.ids);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateHeroSlideSchema)) dto: UpdateHeroSlideDto) {
    return this.slides.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.slides.remove(id);
  }
}
