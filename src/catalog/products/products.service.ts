import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { MediaService } from '../../media/media.service';
import { TranslationsService } from '../../translations/translations.service';
import { CommerceEventBus } from '../../commerce-events/commerce-event-bus.service';
import { COMMERCE_EVENTS } from '../../commerce-events/commerce-events.constants';
import { ProductSearchService } from './product-search.service';
import { slugify } from '../../common/utils/slug.util';
import { Prisma, Product, ProductVariant } from '../../../generated/prisma/client';
import { CreateProductDto, CreateVariantDto, ProductListFilter, UpdateProductDto, UpdateVariantDto } from './dto/product.dto';
import { ProductDocument, ProductMediaItem, ProductPackageContentItem, ProductSocialVideo, ProductStoryItem, ProductZoomedImage } from '../types/product-content.types';
import { buildCombinationHash, buildVariantSkuBase, buildVariantSlug, buildVariantTitle, deriveLegacyImageFields, normalizeDocuments, normalizeFaqs, normalizeInfoSections, normalizeLinks, normalizeMedia, normalizePackageContents, normalizeSocialVideos, normalizeStoryGallery, normalizeTrustBadges, normalizeUpsellTiers, normalizeZoomedImages } from './product-content.util';
import { resolveVariantPrice, sumOptionAdjustments } from '../../pricing/variant-price.util';

const ET_SHOP_PRODUCT = 'shop_product';
const ET_SHOP_VARIANT_ATTR = 'shop_variant_attribute';
const ET_SHOP_VARIATION_OPTION = 'shop_variation_option_value';

/** Ceiling on rows pulled for a sort that has to run in memory (curated
 * order, search rank, price). Well above any realistic collection, and low
 * enough that a public `?sort=price_asc` over the whole catalogue stays
 * bounded. */
const IN_MEMORY_SORT_CAP: number = 500;

/** The swatch-bearing shape of a VariationOptionValue row as the storefront
 * product payload carries it — `swatchUrl` is added by
 * ProductsService.resolveOptionSwatchUrlsInPlace, not stored. */
interface OptionValueSwatch {
  id: string;
  swatchType: string | null;
  swatchValue: string | null;
  swatchUrl?: string | null;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly media: MediaService,
    private readonly translations: TranslationsService,
    private readonly eventBus: CommerceEventBus,
    private readonly searchService: ProductSearchService,
  ) {}

  private syncProductMediaUsage(product: Product): void {
    const keys: Array<{ key: string; field: string }> = [];
    if (product.featuredImageKey) keys.push({ key: product.featuredImageKey, field: 'featuredImageKey' });
    for (const k of product.galleryImageKeys ?? []) keys.push({ key: k, field: 'galleryImageKeys' });
    for (const m of (product.media as unknown as ProductMediaItem[]) ?? []) {
      keys.push({ key: m.key, field: 'media' });
      if (m.posterKey) keys.push({ key: m.posterKey, field: 'media' });
    }
    for (const s of (product.storyGallery as unknown as ProductStoryItem[]) ?? []) keys.push({ key: s.key, field: 'storyGallery' });
    for (const z of (product.zoomedImages as unknown as ProductZoomedImage[]) ?? []) keys.push({ key: z.key, field: 'zoomedImages' });
    for (const p of (product.packageContents as unknown as ProductPackageContentItem[]) ?? []) keys.push({ key: p.key, field: 'packageContents' });
    for (const v of (product.socialVideos as unknown as ProductSocialVideo[]) ?? []) keys.push({ key: v.key, field: 'socialVideos' });

    this.media.syncEntityUsages('product', product.id, keys).catch((err) => this.logger.warn(`Media usage sync failed for product ${product.id}: ${(err as Error).message}`));
  }

  // ── URL resolution ────────────────────────────────────────────────────

  /** Resolves featured + gallery + media + story/zoomed/package/social keys in one Redis batch. */
  private async resolveProductUrls<T extends Record<string, unknown>>(product: T): Promise<T> {
    const media = (product.media as ProductMediaItem[]) ?? [];
    const story = (product.storyGallery as ProductStoryItem[]) ?? [];
    const social = ((product.socialVideos as ProductSocialVideo[]) ?? []).filter((v) => v.isActive !== false);
    const zoomed = (product.zoomedImages as ProductZoomedImage[]) ?? [];
    const packageContents = (product.packageContents as ProductPackageContentItem[]) ?? [];
    const documents = (product.documents as ProductDocument[]) ?? [];
    const variants = product.variants as Array<{ mediaKeys?: string[]; mediaUrls?: string[] }> | undefined;

    // Video transcode metadata (HLS/optimized-mp4 renditions, duration, auto-generated
    // poster) lives on MediaAsset, not on the jsonb ProductMediaItem/ProductSocialVideo —
    // look it up for every video-type item across both the gallery and social videos.
    const videoKeys = [
      ...media.filter((m) => m.type === 'video').map((m) => m.key),
      ...social.map((v) => v.key),
    ];
    const videoAssets = videoKeys.length
      ? await this.prisma.mediaAsset.findMany({
          where: { storageKey: { in: videoKeys } },
          select: {
            storageKey: true,
            hlsKey: true,
            mp4Key: true,
            autoPosterKey: true,
            durationSeconds: true,
            transcodeStatus: true,
            mimeType: true,
          },
        })
      : [];
    const videoAssetByKey = new Map(videoAssets.map((a) => [a.storageKey, a]));
    // Transcode renditions (hlsKey/mp4Key/autoPosterKey) aren't safe to serve until the
    // transcode job actually finished — until then they may be stale, partial, or absent.
    const addTranscodeKeys = (keys: Set<string>, sourceKey: string) => {
      const asset = videoAssetByKey.get(sourceKey);
      if (asset?.transcodeStatus !== 'ready') return;
      if (asset.hlsKey) keys.add(asset.hlsKey);
      if (asset.mp4Key) keys.add(asset.mp4Key);
      if (asset.autoPosterKey) keys.add(asset.autoPosterKey);
    };

    const allKeys = new Set<string>();
    if (product.featuredImageKey) allKeys.add(product.featuredImageKey as string);
    for (const k of (product.galleryImageKeys as string[]) ?? []) allKeys.add(k);
    for (const m of media) {
      allKeys.add(m.key);
      if (m.posterKey) allKeys.add(m.posterKey);
      addTranscodeKeys(allKeys, m.key);
    }
    for (const s of story) allKeys.add(s.key);
    for (const z of zoomed) allKeys.add(z.key);
    for (const p of packageContents) allKeys.add(p.key);
    for (const v of social) {
      allKeys.add(v.key);
      addTranscodeKeys(allKeys, v.key);
    }
    for (const d of documents) allKeys.add(d.storageKey);
    if (variants) for (const v of variants) for (const k of v.mediaKeys ?? []) allKeys.add(k);

    const urlMap = await this.assetUrls.resolveBatch([...allKeys]);

    if (variants) {
      for (const v of variants) v.mediaUrls = (v.mediaKeys ?? []).map((k) => urlMap.get(k)).filter(Boolean) as string[];
    }

    return {
      ...product,
      featuredImageUrl: product.featuredImageKey ? (urlMap.get(product.featuredImageKey as string) ?? null) : null,
      galleryImageUrls: ((product.galleryImageKeys as string[]) ?? []).map((k) => urlMap.get(k)).filter(Boolean),
      media: media.map((m) => {
        const asset = videoAssetByKey.get(m.key);
        const ready = asset?.transcodeStatus === 'ready';
        // Prefer the optimized MP4 rendition over the raw upload once transcoded.
        const mp4Url = ready && asset?.mp4Key ? urlMap.get(asset.mp4Key) : undefined;
        return {
          ...m,
          url: mp4Url ?? urlMap.get(m.key) ?? '',
          posterUrl:
            (m.posterKey ? urlMap.get(m.posterKey) : null) ??
            (ready && asset?.autoPosterKey
              ? urlMap.get(asset.autoPosterKey)
              : null) ??
            null,
          hlsUrl: ready && asset?.hlsKey ? (urlMap.get(asset.hlsKey) ?? null) : null,
          durationSeconds: asset?.durationSeconds ?? null,
          mimeType: asset?.mimeType ?? null,
        };
      }),
      storyGallery: story.map((s) => ({ ...s, url: urlMap.get(s.key) ?? '' })),
      socialVideos: social
        .map((v) => {
          const asset = videoAssetByKey.get(v.key);
          const ready = asset?.transcodeStatus === 'ready';
          const mp4Url = ready && asset?.mp4Key ? urlMap.get(asset.mp4Key) : undefined;
          return {
            ...v,
            url: mp4Url ?? urlMap.get(v.key) ?? '',
            hlsUrl: ready && asset?.hlsKey ? (urlMap.get(asset.hlsKey) ?? null) : null,
            posterUrl: ready && asset?.autoPosterKey ? (urlMap.get(asset.autoPosterKey) ?? null) : null,
            durationSeconds: asset?.durationSeconds ?? null,
          };
        })
        .filter((v) => v.url),
      zoomedImages: zoomed.map((z) => ({ ...z, url: urlMap.get(z.key) ?? '' })),
      packageContents: packageContents.map((p) => ({
        ...p,
        url: urlMap.get(p.key) ?? '',
      })),
      documents: documents.map((d) => ({ ...d, url: urlMap.get(d.storageKey) ?? '' })),
      // Public consumers only ever need active tiers in purchase order — mirrors
      // the socialVideos isActive filter above.
      upsellTiers: ((product.upsellTiers as unknown as { id: string; quantity: number; unitPriceCents: number; active?: boolean; sortOrder: number }[]) ?? [])
        .filter((tier) => tier.active !== false)
        .sort((a, b) => a.quantity - b.quantity),
    };
  }

  /** List resolution: featured image + up to 5 gallery images for card hover switchers. */
  private async resolveProductsUrls<T extends Record<string, unknown>>(products: T[]): Promise<T[]> {
    if (!products.length) return [];
    const MAX_CARD_IMAGES = 5;

    const cardKeys = products.map((p) => {
      const keys: string[] = [];
      if (p.featuredImageKey) keys.push(p.featuredImageKey as string);
      for (const m of (p.media as ProductMediaItem[]) ?? []) {
        if (keys.length >= MAX_CARD_IMAGES) break;
        if (m.type !== 'image' || keys.includes(m.key)) continue;
        keys.push(m.key);
      }
      return keys;
    });

    const urlMap = await this.assetUrls.resolveBatch([...new Set(cardKeys.flat())]);
    return products.map((p, i) => ({
      ...p,
      featuredImageUrl: p.featuredImageKey ? (urlMap.get(p.featuredImageKey as string) ?? null) : null,
      cardImageUrls: cardKeys[i].map((k) => urlMap.get(k)).filter(Boolean),
    }));
  }

  /** For variants whose priceCents is null (computed pricing), substitute the product's basePriceCents. */
  private resolveVariantPricesInPlace(product: { basePriceCents: number | null; variants?: Array<{ priceCents: number | null }> }): void {
    for (const v of product.variants ?? []) {
      if (v.priceCents === null || v.priceCents === undefined) v.priceCents = product.basePriceCents ?? 0;
    }
  }

  /** The price the storefront card renders — mirrors ProductCard's own
   * `defaultVariant?.priceCents ?? basePriceCents`, so sorting by it can
   * never disagree with what the shopper sees. */
  private displayPriceCents(product: {
    basePriceCents: number | null;
    variants?: Array<{ priceCents: number | null; isDefault: boolean }>;
  }): number {
    const variants = product.variants ?? [];
    const def = variants.find((v) => v.isDefault) ?? variants[0];
    return def?.priceCents ?? product.basePriceCents ?? 0;
  }

  /**
   * The `where` fragment that means "this product is on sale".
   *
   * There is no flag on Product to read — a product is on sale when an active
   * automatic promotion reaches it, which is the same three-scope match the
   * storefront card already does when it decides whether to draw a promo
   * badge. `site_wide` is deliberately NOT one of the scopes here: a site-wide
   * promo reaches the entire catalogue, so honouring it would turn the sale
   * listing into the shop listing. Only promotions an admin pointed at
   * specific categories or products mark a product as discounted.
   *
   * Returns a clause matching nothing when no such promotion is running —
   * an empty sale page is the honest answer, not the whole catalogue.
   */
  private async onSalePromotionWhere(): Promise<Prisma.ProductWhereInput> {
    const now = new Date();
    const promos = await this.prisma.shopPromotion.findMany({
      where: {
        isActive: true,
        trigger: 'automatic',
        scope: { in: ['category', 'product'] },
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
      },
      select: { categoryLinks: { select: { categoryId: true } }, productLinks: { select: { productId: true } } },
    });

    const categoryIds = [...new Set(promos.flatMap((p) => p.categoryLinks.map((l) => l.categoryId)))];
    const productIds = [...new Set(promos.flatMap((p) => p.productLinks.map((l) => l.productId)))];
    if (categoryIds.length === 0 && productIds.length === 0) return { id: { in: [] } };

    return {
      OR: [
        ...(categoryIds.length ? [{ categories: { some: { id: { in: categoryIds } } } }] : []),
        ...(productIds.length ? [{ id: { in: productIds } }] : []),
      ],
    };
  }

  /** Product ids for a collection in the admin's curated order. */
  private async collectionOrderedIds(slug: string): Promise<string[]> {
    const links = await this.prisma.collectionProduct.findMany({
      where: { collection: { slug, isActive: true } },
      orderBy: { sortOrder: 'asc' },
      select: { productId: true },
    });
    return links.map((l) => l.productId);
  }

  // ── Admin list ──────────────────────────────────────────────────────────

  async adminList(filter: ProductListFilter = {}) {
    const { status, search, featured, isTestProduct, limit = 20, offset = 0 } = filter;
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(status ? { status: status as Product['status'] } : {}),
      ...(featured !== undefined ? { featured } : {}),
      ...(isTestProduct !== undefined ? { isTestProduct } : {}),
      ...(search
        ? {
            OR: [{ title: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }],
          }
        : {}),
    };

    const [raw, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { categories: true, tags: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items: await this.resolveProductsUrls(raw), total };
  }

  async adminListDeleted(filter: { search?: string; limit?: number; offset?: number } = {}) {
    const { search, limit = 20, offset = 0 } = filter;
    const where: Prisma.ProductWhereInput = {
      deletedAt: { not: null },
      ...(search
        ? {
            OR: [{ title: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }],
          }
        : {}),
    };
    const [raw, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { categories: true },
        orderBy: { deletedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: await this.resolveProductsUrls(raw), total };
  }

  // ── Public list ───────────────────────────────────────────────────────

  async publicList(filter: ProductListFilter & { lang?: string } = {}) {
    const { categoryId, tagId, collection, search, featured, ids, onSale, minPriceCents, maxPriceCents, sort, lang, limit = 24, offset = 0 } = filter;

    // Ranked by Postgres full-text search (falls back to a prefix match so
    // short/partial terms still hit) rather than a plain ILIKE substring —
    // ids come back best-match-first, capped to a pool the where-filters
    // below then narrow by category/tag/featured.
    const rankedIds = search ? await this.searchProductIds(search) : null;
    if (rankedIds && rankedIds.length === 0) return { items: [], total: 0 };

    // A collection's own admin-defined product order lives on the junction
    // (CollectionProduct.sortOrder), which Prisma cannot express as an
    // orderBy on Product — so resolve it to a rank list, same shape as the
    // search rank above.
    const curatedIds =
      collection && (sort ?? 'curated') === 'curated' ? await this.collectionOrderedIds(collection) : null;

    const saleWhere = onSale ? await this.onSalePromotionWhere() : null;

    const where: Prisma.ProductWhereInput = {
      status: 'active',
      deletedAt: null,
      ...(categoryId ? { categories: { some: { id: categoryId } } } : {}),
      ...(tagId ? { tags: { some: { id: tagId } } } : {}),
      ...(collection ? { collectionLinks: { some: { collection: { slug: collection, isActive: true } } } } : {}),
      ...(featured !== undefined ? { featured } : {}),
      ...(ids?.length ? { id: { in: ids } } : {}),
      ...(rankedIds ? { id: { in: rankedIds } } : {}),
      ...(saleWhere ?? {}),
    };

    // Price sorting must match the price the card actually shows — the
    // default variant's own priceCents, falling back to basePriceCents — and
    // that COALESCE lives across two tables, so it is resolved in memory
    // below rather than as a SQL orderBy. A min/max price *filter* has to
    // read the same resolved number, or the listing would hide products whose
    // displayed price is inside the range.
    const filtersPriceInMemory = minPriceCents !== undefined || maxPriceCents !== undefined;
    const sortsInMemory = !!rankedIds || !!curatedIds || sort === 'price_asc' || sort === 'price_desc';
    const resolvesInMemory = sortsInMemory || filtersPriceInMemory;

    const orderBy: Prisma.ProductOrderByWithRelationInput[] | undefined = sortsInMemory
      ? undefined
      : sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : sort === 'name_asc'
          ? [{ title: 'asc' }]
          : // Rating is denormalised onto the product, so "best rated" is a plain
            // SQL sort; reviewCount breaks the tie so one 5-star review does not
            // outrank fifty 4.9-star ones.
            sort === 'rating_desc'
            ? [{ ratingAverage: 'desc' }, { reviewCount: 'desc' }]
            : [{ featured: 'desc' }, { createdAt: 'desc' }];

    // Pagination must happen after re-sorting below, so an in-memory sort
    // fetches the whole match set. Capped so a public `sort=price_asc` on an
    // unfiltered catalogue can't pull every row into memory.
    const [raw, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          categories: true,
          tags: true,
          variants: { include: { inventoryItem: true } },
        },
        orderBy,
        ...(resolvesInMemory ? { take: IN_MEMORY_SORT_CAP } : { take: limit, skip: offset }),
      }),
      this.prisma.product.count({ where }),
    ]);

    if (rankedIds || curatedIds) {
      const order = (curatedIds ?? rankedIds)!;
      const rank = new Map(order.map((id, i) => [id, i]));
      raw.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    } else if (sort === 'price_asc' || sort === 'price_desc') {
      const dir = sort === 'price_asc' ? 1 : -1;
      raw.sort((a, b) => (this.displayPriceCents(a) - this.displayPriceCents(b)) * dir);
    }

    // Filtering after the SQL count means the count is no longer the answer,
    // so the filtered length replaces it. Only reachable when the whole match
    // set was materialised above, capped at IN_MEMORY_SORT_CAP.
    const matched = filtersPriceInMemory
      ? raw.filter((p) => {
          const price = this.displayPriceCents(p);
          if (minPriceCents !== undefined && price < minPriceCents) return false;
          if (maxPriceCents !== undefined && price > maxPriceCents) return false;
          return true;
        })
      : raw;
    const matchedTotal = filtersPriceInMemory ? matched.length : total;
    const page = resolvesInMemory ? matched.slice(offset, offset + limit) : matched;

    const withUrls = await this.resolveProductsUrls(page);
    for (const p of withUrls as unknown as Array<{
      basePriceCents: number | null;
      variants?: Array<{ priceCents: number | null }>;
    }>) {
      this.resolveVariantPricesInPlace(p);
    }

    for (const p of withUrls as unknown as Array<{
      variants?: Array<{
        isDefault: boolean;
        inventoryItem: { available: number } | null;
      }>;
      outOfStock?: boolean;
      defaultVariantOutOfStock?: boolean;
    }>) {
      const variants = p.variants ?? [];
      p.outOfStock = variants.length > 0 && variants.every((v) => (v.inventoryItem?.available ?? 0) <= 0);
      const def = variants.find((v) => v.isDefault);
      p.defaultVariantOutOfStock = def ? (def.inventoryItem?.available ?? 0) <= 0 : false;
    }

    const items = await this.translations.maybeApply(withUrls, ET_SHOP_PRODUCT, lang);
    // Admin-only reference links must never reach a public response.
    for (const p of items as unknown as Array<Record<string, unknown>>) delete p.privateLinks;
    return { items, total: matchedTotal };
  }

  /** Best-match-first product ids for a search term: Postgres full-text match, or a prefix-match fallback for short/partial terms. Capped so downstream filtering stays cheap. */
  private async searchProductIds(search: string, poolSize = 200): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM shop_products
      WHERE status = 'active' AND "deletedAt" IS NULL
        AND (
          to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce("shortDescription", '')) @@ plainto_tsquery('simple', ${search})
          OR title ILIKE ${'%' + search + '%'}
          OR brand ILIKE ${'%' + search + '%'}
          OR sku ILIKE ${'%' + search + '%'}
        )
      ORDER BY
        ts_rank(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce("shortDescription", '')), plainto_tsquery('simple', ${search})) DESC,
        (title ILIKE ${search + '%'}) DESC
      LIMIT ${poolSize}
    `;
    return rows.map((r) => r.id);
  }

  // ── Find one ──────────────────────────────────────────────────────────

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        categories: true,
        tags: true,
        primaryCategory: true,
        freeShippingUpgradeMethods: true,
        variants: {
          include: {
            options: { include: { optionValue: true, attribute: true } },
            inventoryItem: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    const resolved = await this.resolveProductUrls(product);
    this.resolveVariantPricesInPlace(resolved as never);
    return resolved;
  }

  async findBySlug(slug: string, lang?: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'active', deletedAt: null },
      include: {
        categories: true,
        tags: true,
        primaryCategory: true,
        freeShippingUpgradeMethods: true,
        variants: {
          include: {
            options: { include: { optionValue: true, attribute: true } },
            inventoryItem: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    const resolved = await this.resolveProductUrls(product);
    this.resolveVariantPricesInPlace(resolved as never);
    await this.resolveOptionSwatchUrlsInPlace(product.id, resolved as never);
    const [translated] = await this.translations.maybeApply([resolved], ET_SHOP_PRODUCT, lang);
    delete (translated as unknown as Record<string, unknown>).privateLinks;
    return translated;
  }

  /**
   * Fills in `swatchUrl` on every variant option value of a storefront product.
   *
   * Colour swatches are a global hex kept on the VariationOptionValue row, but
   * image swatches are per-product — Product A's "Red" photo isn't Product B's —
   * so the image lives in ProductOptionValueImage and only resolves to a URL in
   * the context of one product. The global `swatchValue` holds a raw storage key
   * for image-type options, which is useless (and misleading) to the storefront,
   * so it is nulled out there exactly like the availability matrix does.
   */
  private async resolveOptionSwatchUrlsInPlace(
    productId: string,
    product: { variants?: Array<{ options?: Array<{ optionValue?: OptionValueSwatch | null }> }> },
  ): Promise<void> {
    const optionValues = (product.variants ?? [])
      .flatMap((v) => v.options ?? [])
      .map((o) => o.optionValue)
      .filter((ov): ov is OptionValueSwatch => !!ov);
    if (!optionValues.length) return;

    const optionImages = await this.prisma.productOptionValueImage.findMany({ where: { productId } });
    const optionImageMap = new Map(optionImages.map((oi) => [oi.optionValueId, oi.mediaKey]));
    const urlMap = await this.assetUrls.resolveBatch([...optionImageMap.values()]);

    for (const ov of optionValues) {
      if (ov.swatchType === 'image') {
        ov.swatchUrl = urlMap.get(optionImageMap.get(ov.id) ?? '') ?? null;
        ov.swatchValue = null;
      } else {
        ov.swatchUrl = null;
      }
    }
  }

  // ── Create ────────────────────────────────────────────────────────────

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.title);
    const existing = await this.prisma.product.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Slug "${slug}" already in use`);

    const media = dto.media ? normalizeMedia(dto.media) : [];
    const legacy = dto.media ? deriveLegacyImageFields(media) : null;

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          slug,
          title: dto.title,
          sku: dto.sku ?? null,
          shortDescription: dto.shortDescription ?? null,
          description: dto.description ?? null,
          brand: dto.brand ?? null,
          specifications: (dto.specifications as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          infoSections: dto.infoSections ? (normalizeInfoSections(dto.infoSections) as unknown as Prisma.InputJsonValue) : [],
          trustBadges: dto.trustBadges ? (normalizeTrustBadges(dto.trustBadges) as unknown as Prisma.InputJsonValue) : [],
          faqs: dto.faqs ? (normalizeFaqs(dto.faqs) as unknown as Prisma.InputJsonValue) : [],
          zoomedImages: dto.zoomedImages ? (normalizeZoomedImages(dto.zoomedImages) as unknown as Prisma.InputJsonValue) : [],
          packageContents: dto.packageContents ? (normalizePackageContents(dto.packageContents) as unknown as Prisma.InputJsonValue) : [],
          storyGallery: dto.storyGallery ? (normalizeStoryGallery(dto.storyGallery) as unknown as Prisma.InputJsonValue) : [],
          socialVideos: dto.socialVideos ? (normalizeSocialVideos(dto.socialVideos) as unknown as Prisma.InputJsonValue) : [],
          socialVideosTitle: dto.socialVideosTitle?.trim() ? dto.socialVideosTitle : null,
          storyNarrativeTitle: dto.storyNarrativeTitle?.trim() ? dto.storyNarrativeTitle : null,
          documents: dto.documents ? (normalizeDocuments(dto.documents) as unknown as Prisma.InputJsonValue) : [],
          privateLinks: dto.privateLinks ? (normalizeLinks(dto.privateLinks) as unknown as Prisma.InputJsonValue) : [],
          featuredImageKey: legacy ? legacy.featuredImageKey : (dto.featuredImageKey ?? null),
          galleryImageKeys: legacy ? legacy.galleryImageKeys : (dto.galleryImageKeys ?? []),
          media: media as unknown as Prisma.InputJsonValue,
          featured: dto.featured ?? false,
          isTestProduct: dto.isTestProduct ?? false,
          freeShipping: dto.freeShipping ?? false,
          freeShippingDaysMin: dto.freeShippingDaysMin ?? null,
          freeShippingDaysMax: dto.freeShippingDaysMax ?? null,
          status: 'draft',
          primaryCategoryId: dto.primaryCategoryId ?? null,
          basePriceCents: dto.basePriceCents,
          upsellingEnabled: dto.upsellingEnabled ?? false,
          upsellTiers: dto.upsellTiers ? (normalizeUpsellTiers(dto.upsellTiers) as unknown as Prisma.InputJsonValue) : [],
          categories: dto.categoryIds?.length ? { connect: dto.categoryIds.map((id) => ({ id })) } : undefined,
          tags: dto.tagIds?.length ? { connect: dto.tagIds.map((id) => ({ id })) } : undefined,
          freeShippingUpgradeMethods: dto.freeShippingUpgradeMethodIds?.length
            ? { connect: dto.freeShippingUpgradeMethodIds.map((id) => ({ id })) }
            : undefined,
        },
      });

      // Default variant uses null priceCents — computed from product.basePriceCents + option adjustments.
      const variant = await tx.productVariant.create({
        data: {
          productId: created.id,
          sku: dto.sku ?? `${slug}-default`,
          title: 'Default',
          priceCents: null,
          compareAtPriceCents: dto.compareAtPriceCents ?? null,
          isDefault: true,
          sortOrder: 0,
        },
      });

      await tx.inventoryItem.create({
        data: {
          variantId: variant.id,
          productId: created.id,
          available: dto.initialStock ?? 0,
        },
      });

      return created;
    });

    this.syncProductMediaUsage(product);
    return product;
  }

  // ── Update ────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      const conflict = await this.prisma.product.findUnique({
        where: { slug: dto.slug },
      });
      if (conflict && conflict.id !== id) throw new ConflictException('Slug already in use');
      slug = dto.slug;
    }

    const media = dto.media !== undefined ? normalizeMedia(dto.media) : (existing.media as unknown as ProductMediaItem[]);
    const legacy = dto.media !== undefined ? deriveLegacyImageFields(media) : null;

    await this.prisma.product.update({
      where: { id },
      data: {
        slug,
        title: dto.title ?? undefined,
        sku: dto.sku !== undefined ? (dto.sku ?? null) : undefined,
        shortDescription: dto.shortDescription !== undefined ? (dto.shortDescription ?? null) : undefined,
        description: dto.description !== undefined ? (dto.description ?? null) : undefined,
        brand: dto.brand !== undefined ? (dto.brand ?? null) : undefined,
        specifications: dto.specifications !== undefined ? ((dto.specifications as Prisma.InputJsonValue) ?? Prisma.JsonNull) : undefined,
        infoSections: dto.infoSections !== undefined ? (normalizeInfoSections(dto.infoSections) as unknown as Prisma.InputJsonValue) : undefined,
        trustBadges: dto.trustBadges !== undefined ? (normalizeTrustBadges(dto.trustBadges) as unknown as Prisma.InputJsonValue) : undefined,
        faqs: dto.faqs !== undefined ? (normalizeFaqs(dto.faqs) as unknown as Prisma.InputJsonValue) : undefined,
        zoomedImages: dto.zoomedImages !== undefined ? (normalizeZoomedImages(dto.zoomedImages) as unknown as Prisma.InputJsonValue) : undefined,
        packageContents: dto.packageContents !== undefined ? (normalizePackageContents(dto.packageContents) as unknown as Prisma.InputJsonValue) : undefined,
        storyGallery: dto.storyGallery !== undefined ? (normalizeStoryGallery(dto.storyGallery) as unknown as Prisma.InputJsonValue) : undefined,
        socialVideos: dto.socialVideos !== undefined ? (normalizeSocialVideos(dto.socialVideos) as unknown as Prisma.InputJsonValue) : undefined,
        socialVideosTitle: dto.socialVideosTitle !== undefined ? (dto.socialVideosTitle?.trim() ? dto.socialVideosTitle : null) : undefined,
        storyNarrativeTitle: dto.storyNarrativeTitle !== undefined ? (dto.storyNarrativeTitle?.trim() ? dto.storyNarrativeTitle : null) : undefined,
        documents: dto.documents !== undefined ? (normalizeDocuments(dto.documents) as unknown as Prisma.InputJsonValue) : undefined,
        privateLinks: dto.privateLinks !== undefined ? (normalizeLinks(dto.privateLinks) as unknown as Prisma.InputJsonValue) : undefined,
        featuredImageKey: legacy ? legacy.featuredImageKey : dto.featuredImageKey !== undefined ? (dto.featuredImageKey ?? null) : undefined,
        galleryImageKeys: legacy ? legacy.galleryImageKeys : dto.galleryImageKeys,
        media: dto.media !== undefined ? (media as unknown as Prisma.InputJsonValue) : undefined,
        featured: dto.featured,
        isTestProduct: dto.isTestProduct,
        freeShipping: dto.freeShipping,
        freeShippingDaysMin: dto.freeShippingDaysMin !== undefined ? (dto.freeShippingDaysMin ?? null) : undefined,
        freeShippingDaysMax: dto.freeShippingDaysMax !== undefined ? (dto.freeShippingDaysMax ?? null) : undefined,
        status: dto.status,
        primaryCategoryId: dto.primaryCategoryId !== undefined ? (dto.primaryCategoryId ?? null) : undefined,
        basePriceCents: dto.basePriceCents !== undefined ? (dto.basePriceCents ?? null) : undefined,
        upsellingEnabled: dto.upsellingEnabled,
        upsellTiers: dto.upsellTiers !== undefined ? (normalizeUpsellTiers(dto.upsellTiers) as unknown as Prisma.InputJsonValue) : undefined,
        categories: dto.categoryIds !== undefined ? { set: dto.categoryIds.map((cid) => ({ id: cid })) } : undefined,
        tags: dto.tagIds !== undefined ? { set: dto.tagIds.map((tid) => ({ id: tid })) } : undefined,
        freeShippingUpgradeMethods:
          dto.freeShippingUpgradeMethodIds !== undefined ? { set: dto.freeShippingUpgradeMethodIds.map((id) => ({ id })) } : undefined,
      },
    });

    // When basePriceCents is explicitly set, clear per-variant price overrides so all
    // variants fall through to the new base price (computed pricing model).
    if (dto.basePriceCents !== undefined && dto.basePriceCents !== null) {
      await this.prisma.productVariant.updateMany({
        where: { productId: id },
        data: { priceCents: null },
      });
    }
    if (dto.compareAtPriceCents !== undefined) {
      await this.prisma.productVariant.updateMany({
        where: { productId: id, isDefault: true },
        data: { compareAtPriceCents: dto.compareAtPriceCents ?? null },
      });
    }

    const fresh = await this.prisma.product.findUniqueOrThrow({
      where: { id },
    });
    this.syncProductMediaUsage(fresh);
    this.eventBus.emit(COMMERCE_EVENTS.PRODUCT_UPDATED, { productId: id }, { entityId: id, source: 'ProductsService.update' });
    return this.findById(id);
  }

  // ── Publish / archive / delete ──────────────────────────────────────────

  async publish(id: string): Promise<Product> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.prisma.product.update({
      where: { id },
      data: {
        status: 'active',
        publishedAt: existing.publishedAt ?? new Date(),
      },
    });
    this.eventBus.emit(COMMERCE_EVENTS.PRODUCT_UPDATED, { productId: id }, { entityId: id, source: 'ProductsService.publish' });
    return this.findById(id);
  }

  async archive(id: string): Promise<Product> {
    await this.assertExists(id);
    await this.prisma.product.update({
      where: { id },
      data: { status: 'archived' },
    });
    this.eventBus.emit(COMMERCE_EVENTS.PRODUCT_UPDATED, { productId: id }, { entityId: id, source: 'ProductsService.archive' });
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.searchService.removeFromIndex(id).catch(() => {});
  }

  async hardDelete(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.product.delete({ where: { id } });
    this.searchService.removeFromIndex(id).catch(() => {});
  }

  async restore(id: string) {
    await this.assertExists(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null },
    });
    return this.findById(id);
  }

  private async assertExists(id: string): Promise<void> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
  }

  // ── Variant helpers ───────────────────────────────────────────────────

  private async resolveOptionValues(optionValueIds: string[]) {
    if (!optionValueIds.length) return [];
    const rows = await this.prisma.variationOptionValue.findMany({
      where: { id: { in: optionValueIds } },
      include: { attribute: true },
    });
    if (rows.length !== optionValueIds.length) throw new BadRequestException('One or more option value IDs are invalid');
    const attrIds = rows.map((r) => r.attributeId);
    if (new Set(attrIds).size !== attrIds.length) throw new BadRequestException('Duplicate attributes in variant options');
    return rows.sort((a, b) => (a.attribute.sortOrder ?? 0) - (b.attribute.sortOrder ?? 0));
  }

  private async checkCombinationUniqueness(productId: string, hash: string | null, excludeVariantId?: string): Promise<void> {
    if (!hash) return;
    const existing = await this.prisma.productVariant.findFirst({
      where: { productId, combinationHash: hash },
    });
    if (existing && existing.id !== excludeVariantId) throw new ConflictException('A variant with this combination of options already exists');
  }

  private async generateUniqueVariantSku(base: string, excludeId?: string): Promise<string> {
    let sku = base.slice(0, 200);
    let n = 2;
    for (;;) {
      const hit = await this.prisma.productVariant.findUnique({
        where: { sku },
      });
      if (!hit || hit.id === excludeId) return sku;
      sku = `${base.slice(0, 196)}-${n++}`;
    }
  }

  private async generateUniqueVariantSlug(productId: string, base: string | null, excludeId?: string): Promise<string | null> {
    if (!base) return null;
    let slug = base.slice(0, 300);
    let n = 2;
    for (;;) {
      const hit = await this.prisma.productVariant.findFirst({
        where: { productId, variantSlug: slug },
      });
      if (!hit || hit.id === excludeId) return slug;
      slug = `${base.slice(0, 296)}-${n++}`;
    }
  }

  private async saveVariantOptions(variantId: string, productId: string, optionValues: Array<{ id: string; attributeId: string; value: string }>): Promise<void> {
    for (const ov of optionValues) {
      await this.prisma.variantOption.create({
        data: {
          variantId,
          attributeId: ov.attributeId,
          optionValueId: ov.id,
          value: ov.value,
        },
      });
      await this.prisma.productVariantAttribute.upsert({
        where: {
          productId_attributeId: { productId, attributeId: ov.attributeId },
        },
        create: { productId, attributeId: ov.attributeId, sortOrder: 0 },
        update: {},
      });
    }
  }

  // ── Variant CRUD ──────────────────────────────────────────────────────

  async addVariant(productId: string, dto: CreateVariantDto): Promise<ProductVariant> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.sku) {
      const conflict = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });
      if (conflict) throw new ConflictException(`SKU "${dto.sku}" already in use`);
    }

    const optionValues = await this.resolveOptionValues((dto.options ?? []).map((o) => o.optionValueId));
    const combinationHash = buildCombinationHash(optionValues.map((v) => v.id));
    await this.checkCombinationUniqueness(productId, combinationHash);

    const sku = dto.sku ?? (await this.generateUniqueVariantSku(buildVariantSkuBase(product, optionValues)));
    const title = dto.title ?? (optionValues.length ? buildVariantTitle(optionValues) : sku);
    const variantSlug = await this.generateUniqueVariantSlug(productId, buildVariantSlug(optionValues));

    const variantId = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.productVariant.create({
        data: {
          productId,
          sku,
          title,
          combinationHash,
          variantSlug,
          priceCents: dto.priceCents ?? null,
          compareAtPriceCents: dto.compareAtPriceCents ?? null,
          barcode: dto.barcode ?? null,
          weightGrams: dto.weightGrams ?? null,
          mediaKeys: dto.mediaKeys ?? [],
          featuredMediaKey: dto.featuredMediaKey ?? null,
          isDefault: dto.isDefault ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      for (const ov of optionValues) {
        await tx.variantOption.create({
          data: {
            variantId: saved.id,
            attributeId: ov.attributeId,
            optionValueId: ov.id,
            value: ov.value,
          },
        });
        await tx.productVariantAttribute.upsert({
          where: {
            productId_attributeId: { productId, attributeId: ov.attributeId },
          },
          create: { productId, attributeId: ov.attributeId, sortOrder: 0 },
          update: {},
        });
      }
      await tx.inventoryItem.create({
        data: {
          variantId: saved.id,
          productId,
          available: dto.initialStock ?? 0,
        },
      });
      return saved.id;
    });

    return this.prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { options: { include: { optionValue: true, attribute: true } } },
    });
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto): Promise<ProductVariant> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    if (dto.sku && dto.sku !== variant.sku) {
      const conflict = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });
      if (conflict && conflict.id !== variantId) throw new ConflictException('SKU already in use');
    }

    const optionValues = dto.options !== undefined ? await this.resolveOptionValues(dto.options?.map((o) => o.optionValueId) ?? []) : null;
    if (optionValues !== null) {
      const newHash = buildCombinationHash(optionValues.map((v) => v.id));
      await this.checkCombinationUniqueness(variant.productId, newHash, variantId);
    }

    const combinationHash = optionValues !== null ? buildCombinationHash(optionValues.map((v) => v.id)) : variant.combinationHash;
    const variantSlug = optionValues !== null ? await this.generateUniqueVariantSlug(variant.productId, buildVariantSlug(optionValues), variantId) : variant.variantSlug;
    const title = dto.title ?? (optionValues !== null && optionValues.length ? buildVariantTitle(optionValues) : variant.title);
    const requestedSku = dto.sku ?? variant.sku;
    const finalSku = requestedSku !== variant.sku ? await this.generateUniqueVariantSku(requestedSku, variantId) : requestedSku;

    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          sku: finalSku,
          title,
          combinationHash,
          variantSlug,
          priceCents: dto.priceCents !== undefined ? (dto.priceCents ?? null) : undefined,
          compareAtPriceCents: dto.compareAtPriceCents !== undefined ? (dto.compareAtPriceCents ?? null) : undefined,
          barcode: dto.barcode !== undefined ? (dto.barcode ?? null) : undefined,
          weightGrams: dto.weightGrams !== undefined ? (dto.weightGrams ?? null) : undefined,
          mediaKeys: dto.mediaKeys,
          featuredMediaKey: dto.featuredMediaKey !== undefined ? (dto.featuredMediaKey ?? null) : undefined,
          isDefault: dto.isDefault,
          sortOrder: dto.sortOrder,
        },
      });

      if (optionValues !== null) {
        await tx.variantOption.deleteMany({ where: { variantId } });
        for (const ov of optionValues) {
          await tx.variantOption.create({
            data: {
              variantId,
              attributeId: ov.attributeId,
              optionValueId: ov.id,
              value: ov.value,
            },
          });
          await tx.productVariantAttribute.upsert({
            where: {
              productId_attributeId: {
                productId: variant.productId,
                attributeId: ov.attributeId,
              },
            },
            create: {
              productId: variant.productId,
              attributeId: ov.attributeId,
              sortOrder: 0,
            },
            update: {},
          });
        }
      }
    });

    return this.prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { options: { include: { optionValue: true, attribute: true } } },
    });
  }

  async deleteVariant(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.prisma.productVariant.delete({ where: { id: variantId } });
  }

  /** Auto-generates every variant combination from the product's linked attributes (Cartesian product of active option values). */
  async generateVariantCombinations(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const productAttrs = await this.prisma.productVariantAttribute.findMany({
      where: { productId },
      include: { attribute: { include: { optionValues: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    if (!productAttrs.length) throw new BadRequestException('Product has no linked variation attributes');

    const axes = productAttrs.map((pa) => ({
      defaultOptionValueId: pa.defaultOptionValueId,
      optionValues: pa.attribute.optionValues.filter((ov) => ov.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
    if (axes.some((ax) => ax.optionValues.length === 0)) throw new BadRequestException('One or more attributes have no active option values');

    const defaultIds = axes.map((ax) => ax.defaultOptionValueId).filter(Boolean) as string[];
    const defaultHash = defaultIds.length === axes.length ? buildCombinationHash(defaultIds) : null;

    type OV = (typeof axes)[number]['optionValues'][number];
    const allCombos: OV[][] = axes.reduce<OV[][]>((acc, ax) => acc.flatMap((a) => ax.optionValues.map((ov) => [...a, ov])), [[]]);

    let created = 0;
    let skipped = 0;
    let sortOrder = await this.prisma.productVariant.count({
      where: { productId },
    });
    const combinations: Array<{
      title: string;
      sku: string;
      isNew: boolean;
      combinationHash: string;
    }> = [];

    const existingVariant = await this.prisma.productVariant.findFirst({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
    const generatedVariantPrice: number | null = product.basePriceCents !== null ? null : (existingVariant?.priceCents ?? 0);

    for (const optionValues of allCombos) {
      const hash = buildCombinationHash(optionValues.map((v) => v.id));
      if (!hash) continue;
      const isDefault = defaultHash !== null && hash === defaultHash;

      const existing = await this.prisma.productVariant.findFirst({
        where: { productId, combinationHash: hash },
      });
      if (existing) {
        if (defaultHash !== null && existing.isDefault !== isDefault) {
          await this.prisma.productVariant.update({
            where: { id: existing.id },
            data: { isDefault },
          });
        }
        skipped++;
        combinations.push({
          title: existing.title,
          sku: existing.sku,
          isNew: false,
          combinationHash: hash,
        });
        continue;
      }

      const sku = await this.generateUniqueVariantSku(buildVariantSkuBase(product, optionValues));
      const title = buildVariantTitle(optionValues);
      const variantSlug = await this.generateUniqueVariantSlug(productId, buildVariantSlug(optionValues));

      await this.prisma.$transaction(async (tx) => {
        const saved = await tx.productVariant.create({
          data: {
            productId,
            sku,
            title,
            combinationHash: hash,
            variantSlug,
            priceCents: generatedVariantPrice,
            isDefault,
            sortOrder: sortOrder++,
          },
        });
        for (const ov of optionValues) {
          await tx.variantOption.create({
            data: {
              variantId: saved.id,
              attributeId: ov.attributeId,
              optionValueId: ov.id,
              value: ov.value,
            },
          });
          await tx.productVariantAttribute.upsert({
            where: {
              productId_attributeId: { productId, attributeId: ov.attributeId },
            },
            create: { productId, attributeId: ov.attributeId, sortOrder: 0 },
            update: {},
          });
        }
        await tx.inventoryItem.create({
          data: { variantId: saved.id, productId, available: 0 },
        });
      });
      created++;
      combinations.push({ title, sku, isNew: true, combinationHash: hash });
    }

    // `combinationHash: { not: defaultHash }` would silently exclude the original
    // null-combinationHash placeholder variant (SQL `<>` never matches NULL), leaving
    // it stuck on isDefault: true alongside the real default — a CASE/ELSE covers
    // every row, NULL included.
    if (defaultHash !== null) {
      await this.prisma.$executeRaw`
        UPDATE shop_product_variants
        SET "isDefault" = CASE WHEN "combinationHash" = ${defaultHash} THEN true ELSE false END
        WHERE "productId" = ${productId}
      `;
    }

    // Delete stale variants — those whose hash is no longer in the current valid set.
    // The original default variant (null combinationHash) is preserved.
    const validHashes = new Set(allCombos.map((ovs) => buildCombinationHash(ovs.map((v) => v.id))).filter(Boolean) as string[]);
    const allVariants = await this.prisma.productVariant.findMany({
      where: { productId },
      select: { id: true, combinationHash: true },
    });
    const staleIds = allVariants.filter((v) => v.combinationHash && !validHashes.has(v.combinationHash)).map((v) => v.id);

    let deleted = 0;
    if (staleIds.length > 0) {
      await this.prisma.productVariant.deleteMany({
        where: { id: { in: staleIds } },
      });
      deleted = staleIds.length;
    }

    return { created, skipped, deleted, combinations };
  }

  // ── Product-level attribute scoping ────────────────────────────────────

  async getProductAttributes(productId: string) {
    await this.assertExists(productId);
    return this.prisma.productVariantAttribute.findMany({
      where: { productId },
      include: { attribute: { include: { optionValues: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addProductAttribute(productId: string, attributeId: string, defaultOptionValueId?: string | null, sortOrder = 0) {
    await this.assertExists(productId);
    const existing = await this.prisma.productVariantAttribute.findUnique({
      where: { productId_attributeId: { productId, attributeId } },
    });
    if (existing) throw new ConflictException('Attribute already assigned to this product');
    return this.prisma.productVariantAttribute.create({
      data: {
        productId,
        attributeId,
        sortOrder,
        defaultOptionValueId: defaultOptionValueId ?? null,
      },
    });
  }

  async updateProductAttribute(productId: string, attributeId: string, defaultOptionValueId: string | null) {
    const row = await this.prisma.productVariantAttribute.findUnique({
      where: { productId_attributeId: { productId, attributeId } },
    });
    if (!row) throw new NotFoundException('Attribute not linked to this product');
    return this.prisma.productVariantAttribute.update({
      where: { id: row.id },
      data: { defaultOptionValueId },
    });
  }

  async removeProductAttribute(productId: string, attributeId: string): Promise<{ deletedVariants: number }> {
    return this.prisma.$transaction(async (tx) => {
      const variantIds = (
        await tx.variantOption.findMany({
          where: { attributeId, variant: { productId } },
          select: { variantId: true },
          distinct: ['variantId'],
        })
      ).map((r) => r.variantId);

      if (variantIds.length > 0) {
        await tx.productVariant.deleteMany({
          where: { id: { in: variantIds } },
        });
      }
      await tx.productVariantAttribute.deleteMany({
        where: { productId, attributeId },
      });

      // When only the original default variant remains (null combinationHash), re-mark it default.
      const remaining = await tx.productVariant.findMany({
        where: { productId },
        select: { id: true, combinationHash: true, isDefault: true },
      });
      const original = remaining.find((v) => !v.combinationHash);
      if (original && remaining.length === 1 && !original.isDefault) {
        await tx.productVariant.update({
          where: { id: original.id },
          data: { isDefault: true },
        });
      }

      return { deletedVariants: variantIds.length };
    });
  }

  // ── Per-product images for "image" swatch option values ─────────────────

  async getProductOptionImages(productId: string) {
    const rows = await this.prisma.productOptionValueImage.findMany({
      where: { productId },
    });
    if (!rows.length) return [];
    const urlMap = await this.assetUrls.resolveBatch(rows.map((r) => r.mediaKey));
    return rows.map((r) => ({
      optionValueId: r.optionValueId,
      mediaKey: r.mediaKey,
      url: urlMap.get(r.mediaKey) ?? null,
    }));
  }

  async setProductOptionImage(productId: string, optionValueId: string, mediaKey: string) {
    await this.assertExists(productId);
    const optionValue = await this.prisma.variationOptionValue.findUnique({
      where: { id: optionValueId },
    });
    if (!optionValue) throw new BadRequestException('Option value not found');

    const linked = await this.prisma.productVariantAttribute.findUnique({
      where: {
        productId_attributeId: {
          productId,
          attributeId: optionValue.attributeId,
        },
      },
    });
    if (!linked) throw new BadRequestException("This option value's attribute is not linked to this product");

    await this.prisma.productOptionValueImage.upsert({
      where: { productId_optionValueId: { productId, optionValueId } },
      create: { productId, optionValueId, mediaKey },
      update: { mediaKey },
    });

    const url = await this.assetUrls.resolve(mediaKey);
    return { optionValueId, mediaKey, url };
  }

  async removeProductOptionImage(productId: string, optionValueId: string): Promise<void> {
    await this.prisma.productOptionValueImage.deleteMany({
      where: { productId, optionValueId },
    });
  }

  // ── Variant resolution (PDP option picker → specific SKU) ───────────────

  async resolveVariant(
    productId: string,
    optionValueIds: string[],
    lang?: string,
  ): Promise<{
    status: 'available' | 'out_of_stock' | 'unavailable';
    variant: {
      id: string; sku: string; title: string;
      priceCents: number; compareAtPriceCents: number | null;
      variantSlug: string | null; featuredMediaUrl: string | null;
      available: number; optionValueIds: string[];
    } | null;
  }> {
    if (!optionValueIds.length) return { status: 'unavailable', variant: null };

    const hash = buildCombinationHash(optionValueIds);
    if (!hash) return { status: 'unavailable', variant: null };

    const [variant, product] = await Promise.all([
      this.prisma.productVariant.findFirst({
        where: { productId, combinationHash: hash },
        include: { options: { include: { optionValue: true } }, inventoryItem: true },
      }),
      this.prisma.product.findUnique({ where: { id: productId } }),
    ]);
    if (!variant) return { status: 'unavailable', variant: null };

    // variant.title (e.g. "Noir / S") is baked once, in the base language,
    // at variant-creation time (see buildVariantTitle) — reconstruct it from
    // the (translation-overlaid) option values for any non-default lang,
    // same as getVariantAvailabilityMatrix does, so this endpoint's title
    // never overrides an already-translated matrix title with a stale
    // French one (resolveVariant's result takes priority on the PDP).
    let title = variant.title;
    if (lang) {
      const sortedOptions = [...variant.options].filter((o) => o.optionValueId);
      if (sortedOptions.length) {
        const productAttrs = await this.prisma.productVariantAttribute.findMany({ where: { productId } });
        const attrSortOrder = new Map(productAttrs.map((pa) => [pa.attributeId, pa.sortOrder]));
        sortedOptions.sort((a, b) => (attrSortOrder.get(a.attributeId) ?? 0) - (attrSortOrder.get(b.attributeId) ?? 0));
        const translatedOptions = await this.translations.applyToEntities(
          sortedOptions.map((o) => ({ id: o.optionValueId as string, value: o.value })),
          ET_SHOP_VARIATION_OPTION,
          lang,
        );
        title = translatedOptions.map((ov) => (ov as { displayValue?: string; value: string }).displayValue ?? ov.value).join(' / ');
      }
    }

    const hasInventory = !!variant.inventoryItem;
    const available = hasInventory ? (variant.inventoryItem!.available ?? 0) : -1;

    const featuredMediaUrl = variant.featuredMediaKey ? ((await this.assetUrls.resolveBatch([variant.featuredMediaKey])).get(variant.featuredMediaKey) ?? null) : null;

    const effectivePriceCents = resolveVariantPrice({
      variantPriceCents: variant.priceCents,
      basePriceCents: product?.basePriceCents ?? null,
      optionAdjustmentCents: sumOptionAdjustments(variant.options),
    });

    return {
      status: !hasInventory || available > 0 ? 'available' : 'out_of_stock',
      variant: {
        id: variant.id,
        sku: variant.sku,
        title,
        priceCents: effectivePriceCents,
        compareAtPriceCents: variant.compareAtPriceCents ?? null,
        variantSlug: variant.variantSlug ?? null,
        featuredMediaUrl,
        available,
        optionValueIds: variant.options.map((o) => o.optionValueId).filter(Boolean) as string[],
      },
    };
  }

  async getVariantStock(variantId: string): Promise<{ available: number; inStock: boolean }> {
    const inventory = await this.prisma.inventoryItem.findUnique({ where: { variantId } });
    if (!inventory) return { available: -1, inStock: true };
    return { available: inventory.available, inStock: inventory.available > 0 };
  }

  /**
   * Returns all variants with their option combinations and stock levels.
   * The frontend uses this to disable unavailable option choices and
   * resolve which variant is selected given current option picks.
   */
  async getVariantAvailabilityMatrix(productId: string, lang?: string): Promise<{
    attributes: Array<{
      id: string; name: string; slug: string;
      displayType: string; sortOrder: number;
      defaultOptionValueId: string | null;
      optionValues: Array<{
        id: string; value: string; displayValue: string | null;
        swatchValue: string | null; swatchUrl: string | null; swatchType: string | null; sortOrder: number;
      }>;
    }>;
    variants: Array<{
      id: string; sku: string; title: string;
      priceCents: number; compareAtPriceCents: number | null;
      variantSlug: string | null; featuredMediaUrl: string | null;
      optionValueIds: string[];
      available: number; inStock: boolean;
    }>;
  }> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    // Source attributes from the product's linked variations (not from existing variants)
    const productAttrs = await this.prisma.productVariantAttribute.findMany({
      where: { productId },
      include: { attribute: { include: { optionValues: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    let variants = await this.prisma.productVariant.findMany({
      where: { productId },
      include: { options: { include: { optionValue: true } }, inventoryItem: true },
    });

    // Exclude the preserved original default variant (null combinationHash)
    // when variation attributes exist — it shouldn't appear in the option picker.
    if (productAttrs.length > 0) {
      variants = variants.filter((v) => v.combinationHash !== null);
    }

    const hasInventory = variants.some((v) => !!v.inventoryItem);

    const mediaKeys = variants.map((v) => v.featuredMediaKey).filter(Boolean) as string[];
    // Image swatches are per-product (Product A's "Red" photo isn't Product B's),
    // so resolve them from this product's option-value image overrides.
    const optionImages = await this.prisma.productOptionValueImage.findMany({ where: { productId } });
    const optionImageMap = new Map(optionImages.map((oi) => [oi.optionValueId, oi.mediaKey]));
    const swatchKeys = [...optionImageMap.values()];
    const urlMap = await this.assetUrls.resolveBatch([...mediaKeys, ...swatchKeys]);

    let attributes: Array<Record<string, unknown>> = productAttrs.map((pa) => ({
      id: pa.attribute.id,
      name: pa.attribute.name,
      slug: pa.attribute.slug,
      displayType: pa.attribute.displayType,
      sortOrder: pa.sortOrder,
      defaultOptionValueId: pa.defaultOptionValueId,
      optionValues: [...pa.attribute.optionValues]
        .filter((ov) => ov.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((ov) => ({
          id: ov.id,
          value: ov.value,
          displayValue: ov.displayValue,
          // Color swatches are a global hex value; image swatches are per-product
          // (see optionImageMap) so the global swatchValue is not exposed here.
          swatchValue: ov.swatchType === 'color' ? ov.swatchValue : null,
          swatchUrl: ov.swatchType === 'image' ? (urlMap.get(optionImageMap.get(ov.id) ?? '') ?? null) : null,
          swatchType: ov.swatchType,
          sortOrder: ov.sortOrder,
        })),
    }));

    attributes = await this.translations.maybeApply(attributes, ET_SHOP_VARIANT_ATTR, lang);
    for (const attr of attributes) {
      const optionValues = attr.optionValues as Array<Record<string, unknown>>;
      if (optionValues?.length) {
        attr.optionValues = await this.translations.maybeApply(optionValues, ET_SHOP_VARIATION_OPTION, lang);
      }
    }

    // v.title (e.g. "Noir / S") is baked once, in the base language, at
    // variant-creation time (see buildVariantTitle) — it never picks up
    // option-value translations on its own. Reconstruct it from the
    // option values above (now translation-overlaid) for any non-default
    // lang, same join/sort rule buildVariantTitle uses, so the storefront
    // never shows a French title next to an already-translated attribute
    // picker.
    const attrSortOrder = new Map(productAttrs.map((pa) => [pa.attributeId, pa.sortOrder]));
    const translatedDisplayValue = new Map<string, string>();
    for (const attr of attributes) {
      for (const ov of (attr.optionValues as Array<{ id: string; displayValue: string | null; value: string }>) ?? []) {
        translatedDisplayValue.set(ov.id, ov.displayValue ?? ov.value);
      }
    }

    return {
      attributes: attributes as never,
      variants: variants.map((v) => {
        const sortedOptions = [...v.options]
          .filter((o) => o.optionValueId)
          .sort((a, b) => (attrSortOrder.get(a.attributeId) ?? 0) - (attrSortOrder.get(b.attributeId) ?? 0));
        const title = lang && sortedOptions.length ? sortedOptions.map((o) => translatedDisplayValue.get(o.optionValueId!) ?? o.value).join(' / ') : v.title;
        return {
          id: v.id,
          sku: v.sku,
          title,
          priceCents: resolveVariantPrice({
            variantPriceCents: v.priceCents,
            basePriceCents: product.basePriceCents,
            optionAdjustmentCents: sumOptionAdjustments(v.options),
          }),
          compareAtPriceCents: v.compareAtPriceCents,
          variantSlug: v.variantSlug,
          featuredMediaUrl: v.featuredMediaKey ? (urlMap.get(v.featuredMediaKey) ?? null) : null,
          optionValueIds: v.options.map((o) => o.optionValueId).filter(Boolean) as string[],
          available: hasInventory ? (v.inventoryItem?.available ?? 0) : 1,
          inStock: !hasInventory || (v.inventoryItem?.available ?? 0) > 0,
        };
      }),
    };
  }

  /** Finds a variant by its URL slug within a product. */
  async getVariantBySlug(productId: string, variantSlug: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { productId, variantSlug },
      include: { options: { include: { optionValue: true, attribute: true } }, inventoryItem: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }
}
