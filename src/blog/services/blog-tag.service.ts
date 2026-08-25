import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';
import { BlogTag } from '../../../generated/prisma/client';
import { CreateBlogTagDto, UpdateBlogTagDto } from '../dto/blog-tag.dto';

@Injectable()
export class BlogTagService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<BlogTag[]> {
    return this.prisma.blogTag.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<BlogTag> {
    const tag = await this.prisma.blogTag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return tag;
  }

  async create(dto: CreateBlogTagDto): Promise<BlogTag> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertUnique(dto.name, slug);
    return this.prisma.blogTag.create({ data: { name: dto.name, slug } });
  }

  async update(id: string, dto: UpdateBlogTagDto): Promise<BlogTag> {
    await this.findOne(id);
    const slug = dto.slug !== undefined ? slugify(dto.slug) : undefined;
    if (dto.name !== undefined || slug !== undefined) {
      await this.assertUnique(dto.name, slug, id);
    }
    return this.prisma.blogTag.update({
      where: { id },
      data: { name: dto.name, slug },
    });
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.findOne(id);
    await this.prisma.blogTag.delete({ where: { id } });
    return { ok: true };
  }

  private async assertUnique(
    name?: string,
    slug?: string,
    excludeId?: string,
  ): Promise<void> {
    if (!name && !slug) return;
    const existing = await this.prisma.blogTag.findFirst({
      where: { OR: [...(name ? [{ name }] : []), ...(slug ? [{ slug }] : [])] },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Tag "${name ?? slug}" already exists`);
    }
  }
}
