import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { HomeSectionsService } from './home-sections.service';
import {
  CreateHomeSectionDto,
  CreateHomeSectionSchema,
  ReorderHomeSectionsDto,
  ReorderHomeSectionsSchema,
  UpdateHomeSectionDto,
  UpdateHomeSectionSchema,
} from './dto/home-section.dto';

@Controller('admin/shop/home-sections')
export class HomeSectionsAdminController {
  constructor(private readonly sections: HomeSectionsService) {}

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
