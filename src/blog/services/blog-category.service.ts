import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';
import { BlogCategory } from '../../../generated/prisma/client';
import { TranslationsService } from '../../translations/translations.service';
import {
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
} from '../dto/blog-category.dto';

export const ET_BLOG_CATEGORY = 'blog_category';

@Injectable()
export class BlogCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
  ) {}

  async findAll(activeOnly = false, lang?: string): Promise<BlogCategory[]> {
    const cats = await this.prisma.blogCategory.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return this.translations.maybeApply(
      cats as unknown as Record<string, unknown>[],
      ET_BLOG_CATEGORY,
      lang,
    ) as unknown as Promise<BlogCategory[]>;
  }

  async findOne(id: string): Promise<BlogCategory> {
    const category = await this.prisma.blogCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async create(dto: CreateBlogCategoryDto): Promise<BlogCategory> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertSlugFree(slug);

    return this.prisma.blogCategory.create({
      data: {
        name: dto.name,
        slug,
        color: dto.color ?? null,
        description: dto.description ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateBlogCategoryDto): Promise<BlogCategory> {
    await this.findOne(id);

    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = slugify(dto.slug);
      await this.assertSlugFree(slug, id);
    }

    return this.prisma.blogCategory.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        color: dto.color,
        description: dto.description,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.findOne(id);
    await this.translations.deleteForEntity(ET_BLOG_CATEGORY, id);
    await this.prisma.blogCategory.delete({ where: { id } });
    return { ok: true };
  }

  private async assertSlugFree(
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.blogCategory.findUnique({
      where: { slug },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" is already in use`);
    }
  }
}
