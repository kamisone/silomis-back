import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { TranslationsService } from '../translations/translations.service';
import { CreateCollectionDto, UpdateCollectionDto } from './dto/collection.dto';

const ET_SHOP_COLLECTION = 'shop_collection';

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly translations: TranslationsService,
  ) {}

  // ── Image URL resolution ────────────────────────────────────────────────

  /** A collection carries two images: `imageKey` is the card shown in the
   * storefront listing, `bannerImageKey` the wide hero on its own page. Both
   * resolve to URLs here; the banner is optional and the page falls back to
   * the card image when it is unset. */
  private async withImageUrl<T extends { imageKey: string | null; bannerImageKey?: string | null }>(
    item: T,
  ): Promise<T & { imageUrl: string | null; bannerImageUrl: string | null }> {
    const [imageUrl, bannerImageUrl] = await Promise.all([
      item.imageKey ? this.assetUrls.resolve(item.imageKey) : null,
      item.bannerImageKey ? this.assetUrls.resolve(item.bannerImageKey) : null,
    ]);
    return { ...item, imageUrl, bannerImageUrl };
  }

  private async withImageUrls<T extends { imageKey: string | null; bannerImageKey?: string | null }>(
    items: T[],
  ): Promise<Array<T & { imageUrl: string | null; bannerImageUrl: string | null }>> {
    if (!items.length) return [];
    const keys = items.flatMap((i) => [i.imageKey, i.bannerImageKey]).filter((k): k is string => !!k);
    const urlMap = await this.assetUrls.resolveBatch(keys);
    return items.map((i) => ({
      ...i,
      imageUrl: i.imageKey ? (urlMap.get(i.imageKey) ?? null) : null,
      bannerImageUrl: i.bannerImageKey ? (urlMap.get(i.bannerImageKey) ?? null) : null,
    }));
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminList(
    filter: {
      isActive?: boolean;
      isFeatured?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { isActive, isFeatured, limit = 20, offset = 0 } = filter;
    const where = {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(isFeatured !== undefined ? { isFeatured } : {}),
    };
    const [raw, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        // Counts every linked product, including drafts/soft-deleted ones —
        // this is the admin's own membership figure, not the storefront's.
        // publicList() counts only what a shopper can actually see.
        include: { _count: { select: { productLinks: true } } },
      }),
      this.prisma.collection.count({ where }),
    ]);
    const withUrls = await this.withImageUrls(raw);
    return {
      items: withUrls.map(({ _count, ...c }) => ({
        ...c,
        productCount: _count.productLinks,
      })),
      total,
    };
  }

  async findById(id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        productLinks: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    return this.withImageUrl(collection);
  }

  async create(dto: CreateCollectionDto) {
    await this.assertSlugAvailable(dto.slug, null);
    const created = await this.prisma.collection.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description ?? null,
        imageKey: dto.imageKey ?? null,
        bannerImageKey: dto.bannerImageKey ?? null,
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        heroTitle: dto.heroTitle ?? null,
        heroSubtitle: dto.heroSubtitle ?? null,
        heroCopy: dto.heroCopy ?? null,
        bodyHtml: dto.bodyHtml ?? null,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        sortOrder: dto.sortOrder ?? 0,
        publishedAt: dto.publishedAt ?? null,
      },
    });
    return this.withImageUrl(created);
  }

  async update(id: string, dto: UpdateCollectionDto) {
    await this.findById(id);
    if (dto.slug !== undefined) await this.assertSlugAvailable(dto.slug, id);

    const updated = await this.prisma.collection.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.imageKey !== undefined ? { imageKey: dto.imageKey } : {}),
        ...(dto.bannerImageKey !== undefined
          ? { bannerImageKey: dto.bannerImageKey }
          : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
        ...(dto.seoDescription !== undefined
          ? { seoDescription: dto.seoDescription }
          : {}),
        ...(dto.metaKeywords !== undefined
          ? { metaKeywords: dto.metaKeywords }
          : {}),
        ...(dto.heroTitle !== undefined ? { heroTitle: dto.heroTitle } : {}),
        ...(dto.heroSubtitle !== undefined
          ? { heroSubtitle: dto.heroSubtitle }
          : {}),
        ...(dto.heroCopy !== undefined ? { heroCopy: dto.heroCopy } : {}),
        ...(dto.bodyHtml !== undefined ? { bodyHtml: dto.bodyHtml } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.publishedAt !== undefined
          ? { publishedAt: dto.publishedAt }
          : {}),
      },
    });
    return this.withImageUrl(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.collection.delete({ where: { id } });
    await this.translations.deleteForEntity(ET_SHOP_COLLECTION, id);
  }

  async addProduct(collectionId: string, productId: string) {
    await this.findById(collectionId);
    const existing = await this.prisma.collectionProduct.findUnique({
      where: { collectionId_productId: { collectionId, productId } },
      include: { product: true },
    });
    if (existing) return existing;
    const count = await this.prisma.collectionProduct.count({
      where: { collectionId },
    });
    return this.prisma.collectionProduct.create({
      data: { collectionId, productId, sortOrder: count },
      include: { product: true },
    });
  }

  async removeProduct(collectionId: string, productId: string): Promise<void> {
    const link = await this.prisma.collectionProduct.findUnique({
      where: { collectionId_productId: { collectionId, productId } },
    });
    if (!link)
      throw new NotFoundException('Product is not linked to this collection');
    await this.prisma.collectionProduct.delete({ where: { id: link.id } });
  }

  /** Bulk-sets sortOrder from array position — powers the admin drag-reorder UI. */
  async reorderProducts(
    collectionId: string,
    productIds: string[],
  ): Promise<void> {
    await this.findById(collectionId);
    await this.prisma.$transaction(
      productIds.map((productId, index) =>
        this.prisma.collectionProduct.update({
          where: { collectionId_productId: { collectionId, productId } },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  // ── Public ───────────────────────────────────────────────────────────────

  async publicList(lang?: string) {
    const raw = await this.prisma.collection.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        // Card image only — the listing never renders the wide banner.
        imageKey: true,
        isFeatured: true,
        // Only products a shopper can actually reach, so the count on a
        // collection card matches what the collection page will render.
        _count: {
          select: {
            productLinks: {
              where: { product: { status: 'active', deletedAt: null } },
            },
          },
        },
      },
    });
    const withUrls = await this.withImageUrls(raw);
    const withCounts = withUrls.map(({ _count, ...c }) => ({
      ...c,
      productCount: _count.productLinks,
    }));
    return this.translations.maybeApply(withCounts, ET_SHOP_COLLECTION, lang);
  }

  async featuredList(lang?: string) {
    const raw = await this.prisma.collection.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        imageKey: true,
      },
    });
    const withUrls = await this.withImageUrls(raw);
    return this.translations.maybeApply(withUrls, ET_SHOP_COLLECTION, lang);
  }

  async findBySlug(slug: string, lang?: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { slug, isActive: true },
      include: {
        productLinks: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
          where: { product: { status: 'active', deletedAt: null } },
        },
      },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    const withUrl = await this.withImageUrl(collection);
    return this.translations.maybeApplyOne(withUrl, ET_SHOP_COLLECTION, lang);
  }

  // ── Validation ───────────────────────────────────────────────────────────

  private async assertSlugAvailable(
    slug: string,
    excludeId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.collection.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException(`Slug "${slug}" already in use`);
  }
}
