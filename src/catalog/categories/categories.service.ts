import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { slugify } from '../../common/utils/slug.util';
import { ProductCategory } from '../../../generated/prisma/client';
import { TranslationsService } from '../../translations/translations.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

const ET_SHOP_PRODUCT_CATEGORY = 'shop_product_category';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly translations: TranslationsService,
  ) {}

  findAll(): Promise<ProductCategory[]> {
    return this.prisma.productCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  /**
   * Storefront category list. `imageKey` is a raw storage key, so it is resolved
   * to a URL here the way collections already do — the homepage category tiles
   * and any other picture-bearing surface can't do it themselves.
   */
  async findActive(): Promise<Array<ProductCategory & { imageUrl: string | null }>> {
    const categories = await this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const keys = categories.map((c) => c.imageKey).filter((k): k is string => !!k);
    const urlMap = keys.length ? await this.assetUrls.resolveBatch(keys) : new Map<string, string>();
    return categories.map((c) => ({
      ...c,
      imageUrl: c.imageKey ? (urlMap.get(c.imageKey) ?? null) : null,
    }));
  }

  async findOne(id: string): Promise<ProductCategory> {
    const category = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<ProductCategory> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertSlugFree(slug);
    if (dto.parentId) await this.findOne(dto.parentId);

    return this.prisma.productCategory.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        imageKey: dto.imageKey ?? null,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<ProductCategory> {
    await this.findOne(id);
    if (dto.parentId === id) throw new ConflictException('A category cannot be its own parent');
    if (dto.parentId) await this.findOne(dto.parentId);

    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = slugify(dto.slug);
      await this.assertSlugFree(slug, id);
    }

    return this.prisma.productCategory.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        imageKey: dto.imageKey,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.findOne(id);
    const childCount = await this.prisma.productCategory.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ConflictException(`Category has ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} — move or delete them first`);
    }
    await this.translations.deleteForEntity(ET_SHOP_PRODUCT_CATEGORY, id);
    await this.prisma.productCategory.delete({ where: { id } });
    return { ok: true };
  }

  private async assertSlugFree(slug: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.productCategory.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" is already in use`);
    }
  }
}
