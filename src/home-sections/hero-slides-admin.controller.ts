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
const TranslateHtmlSchema = z.object({ html: z.string().min(1).max(50000) });

@Controller('admin/shop/hero-slides')
export class HeroSlidesAdminController {
  constructor(
    private readonly slides: HeroSlidesService,
    private readonly translation: TranslationService,
  ) {}

  // ── AI translation ─────────────────────────────────────────────────────
  // English in, the other six out. Plain fields (the eyebrow, a button label)
  // post `{ text }`; the card's copy is markup and posts `{ html }`.

  @Post('sections/text/translate')
  translateText(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateCopy(dto.text);
  }

  /** The card's copy, which is a rich-text block. */
  @Post('sections/html/translate')
  translateHtml(@Body(new ZodValidationPipe(TranslateHtmlSchema)) dto: z.infer<typeof TranslateHtmlSchema>) {
    return this.translation.translateCopyHtml(dto.html);
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
