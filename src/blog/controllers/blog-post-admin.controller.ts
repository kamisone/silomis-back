import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BlogPostService } from '../services/blog-post.service';
import {
  CreateBlogPostDto,
  CreateBlogPostSchema,
  UpdateBlogPostDto,
  UpdateBlogPostSchema,
} from '../dto/blog-post.dto';
import { BlogPostStatus } from '../../../generated/prisma/client';

@Controller('admin/blog/posts')
export class BlogPostAdminController {
  constructor(private readonly posts: BlogPostService) {}

  @Get()
  list(
    @Query('status') status?: BlogPostStatus,
    @Query('categoryId') categoryId?: string,
    @Query('tagId') tagId?: string,
    @Query('search') search?: string,
    @Query('featured') featured?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.posts.adminList({
      status,
      categoryId,
      tagId,
      search,
      featured:
        featured === 'true' ? true : featured === 'false' ? false : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.posts.adminFindOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateBlogPostSchema)) dto: CreateBlogPostDto,
  ) {
    return this.posts.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBlogPostSchema)) dto: UpdateBlogPostDto,
  ) {
    return this.posts.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string) {
    return this.posts.publish(id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string) {
    return this.posts.archive(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.posts.remove(id);
  }
}
