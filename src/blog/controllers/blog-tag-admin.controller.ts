import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BlogTagService } from '../services/blog-tag.service';
import {
  CreateBlogTagDto,
  CreateBlogTagSchema,
  UpdateBlogTagDto,
  UpdateBlogTagSchema,
} from '../dto/blog-tag.dto';

@Controller('admin/blog/tags')
export class BlogTagAdminController {
  constructor(private readonly tags: BlogTagService) {}

  @Get()
  findAll() {
    return this.tags.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tags.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBlogTagSchema)) dto: CreateBlogTagDto,
  ) {
    return this.tags.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBlogTagSchema)) dto: UpdateBlogTagDto,
  ) {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
