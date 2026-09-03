import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { slugify } from '../../common/utils/slug.util';
import { Prisma, ProductCategory } from '../../../generated/prisma/client';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_CATEGORY } from '../../translations/translation-entities';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly translations: TranslationsService,
  ) {}

  /**
   * Admin category list. Carries `imageUrl` for the same reason the storefront
   * list does: the admin form has to show the picture that is already set, and
   * a raw storage key is not something it can render.
   */
  findAll(): Promise<Array<ProductCategory & { imageUrl: string | null; bannerUrl: string | null }>> {
    return this.listWithImages({});
  }

  /**
   * Storefront category list. `imageKey` is a raw storage key, so it is resolved
   * to a URL here the way collections already do — the homepage category tiles
   * and any other picture-bearing surface can't do it themselves.
   *
   * `lang` overlays the admin's translated name/description when present —
   * every caller (header nav, home tiles, the shop sidebar) fetches this same
   * list, so switching locale without it left every one of them stuck on the
   * category's base-language name.
   */
  async findActive(lang?: string): Promise<Array<ProductCategory & { imageUrl: string | null; bannerUrl: string | null }>> {
    const categories = await this.listWithImages({ isActive: true });
    return this.translations.maybeApply(categories, ET_SHOP_CATEGORY, lang);
  }

  /** One batch resolve for the whole list rather than a lookup per row. */
  private async listWithImages(
    where: Prisma.ProductCategoryWhereInput,
  ): Promise<Array<ProductCategory & { imageUrl: string | null; bannerUrl: string | null }>> {
    const categories = await this.prisma.productCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    // Both pictures resolve in the same round trip — two batches for one list
    // would be the same query twice.
    const keys = categories.flatMap((c) => [c.imageKey, c.bannerKey]).filter((k): k is string => !!k);
    const urlMap = keys.length ? await this.assetUrls.resolveBatch(keys) : new Map<string, string>();
    return categories.map((c) => ({
      ...c,
      imageUrl: c.imageKey ? (urlMap.get(c.imageKey) ?? null) : null,
      bannerUrl: c.bannerKey ? (urlMap.get(c.bannerKey) ?? null) : null,
    }));
  }

  async findOne(id: string): Promise<ProductCategory> {
    const category = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  /**
   * The slider needs two real, ordered endpoints to be a slider at all — so
   * whenever the price filter ends up on, both bounds must be present and
   * min below max. Skipped entirely when nothing about the price filter was
   * touched in this request: a category saved from before this pair existed
   * can still have `showPriceFilter: true` with no bounds set, and an
   * unrelated edit (renaming it, say) shouldn't start failing because of a
   * setting the admin isn't even looking at right now.
   */
  private assertValidPriceFilterBounds(showPriceFilter: boolean, minCents: number | null | undefined, maxCents: number | null | undefined): void {
    if (!showPriceFilter) return;
    if (minCents == null || maxCents == null) {
      throw new BadRequestException('Set a minimum and maximum price before turning the price filter on.');
    }
    if (minCents >= maxCents) {
      throw new BadRequestException("The price filter's minimum must be less than its maximum.");
    }
  }

  async create(dto: CreateCategoryDto): Promise<ProductCategory> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertSlugFree(slug);
    if (dto.parentId) await this.findOne(dto.parentId);

    // Off by default for a brand-new category — on requires bounds, and a
    // category that doesn't exist yet has none to default to.
    const showPriceFilter = dto.showPriceFilter ?? false;
    this.assertValidPriceFilterBounds(showPriceFilter, dto.priceFilterMinCents, dto.priceFilterMaxCents);

    return this.prisma.productCategory.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        imageKey: dto.imageKey ?? null,
        bannerKey: dto.bannerKey ?? null,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        showPriceFilter,
        priceFilterMinCents: dto.priceFilterMinCents ?? null,
        priceFilterMaxCents: dto.priceFilterMaxCents ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<ProductCategory> {
    const existing = await this.findOne(id);
    if (dto.parentId === id) throw new ConflictException('A category cannot be its own parent');
    if (dto.parentId) await this.findOne(dto.parentId);

    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = slugify(dto.slug);
      await this.assertSlugFree(slug, id);
    }

    const priceFilterTouched = dto.showPriceFilter !== undefined || dto.priceFilterMinCents !== undefined || dto.priceFilterMaxCents !== undefined;
    if (priceFilterTouched) {
      const effectiveShowPriceFilter = dto.showPriceFilter !== undefined ? dto.showPriceFilter : existing.showPriceFilter;
      const effectiveMin = dto.priceFilterMinCents !== undefined ? dto.priceFilterMinCents : existing.priceFilterMinCents;
      const effectiveMax = dto.priceFilterMaxCents !== undefined ? dto.priceFilterMaxCents : existing.priceFilterMaxCents;
      this.assertValidPriceFilterBounds(effectiveShowPriceFilter, effectiveMin, effectiveMax);
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
        bannerKey: dto.bannerKey,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        showPriceFilter: dto.showPriceFilter,
        priceFilterMinCents: dto.priceFilterMinCents,
        priceFilterMaxCents: dto.priceFilterMaxCents,
      },
    });
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.findOne(id);
    const childCount = await this.prisma.productCategory.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ConflictException(`Category has ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} — move or delete them first`);
    }
    await this.translations.deleteForEntity(ET_SHOP_CATEGORY, id);
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
