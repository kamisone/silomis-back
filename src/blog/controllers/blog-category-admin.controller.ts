import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BlogCategoryService } from '../services/blog-category.service';
import {
  CreateBlogCategoryDto,
  CreateBlogCategorySchema,
  UpdateBlogCategoryDto,
  UpdateBlogCategorySchema,
} from '../dto/blog-category.dto';

@Controller('admin/blog/categories')
export class BlogCategoryAdminController {
  constructor(private readonly categories: BlogCategoryService) {}

  @Get()
  findAll(@Query('active') active?: string) {
    return this.categories.findAll(active === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categories.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBlogCategorySchema))
    dto: CreateBlogCategoryDto,
  ) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBlogCategorySchema))
    dto: UpdateBlogCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
