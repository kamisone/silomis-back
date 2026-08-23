import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, CreateCategorySchema, UpdateCategoryDto, UpdateCategorySchema } from './dto/category.dto';

@Controller('admin/shop/categories')
export class CategoryAdminController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll() {
    return this.categories.findAll();
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateCategorySchema)) dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categories.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateCategorySchema)) dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
