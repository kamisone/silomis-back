import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { HeroSlidesService } from './hero-slides.service';
import {
  CreateHeroSlideDto,
  CreateHeroSlideSchema,
  ReorderHeroSlidesDto,
  ReorderHeroSlidesSchema,
  UpdateHeroSlideDto,
  UpdateHeroSlideSchema,
} from './dto/hero-slide.dto';

@Controller('admin/shop/hero-slides')
export class HeroSlidesAdminController {
  constructor(private readonly slides: HeroSlidesService) {}

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
