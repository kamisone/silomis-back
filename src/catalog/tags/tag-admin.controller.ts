import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TagsService } from './tags.service';
import { CreateTagDto, CreateTagSchema, UpdateTagDto, UpdateTagSchema } from './dto/tag.dto';

@Controller('admin/shop/tags')
export class TagAdminController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  findAll() {
    return this.tags.findAll();
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateTagSchema)) dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateTagSchema)) dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
