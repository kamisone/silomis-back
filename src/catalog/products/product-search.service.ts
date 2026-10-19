import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeilisearchService } from '../../meilisearch/meilisearch.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_CATEGORY, ET_SHOP_PRODUCT } from '../../translations/translation-entities';
import { Prisma } from '../../../generated/prisma/client';

const INDEX = 'shop_products';

/** A storefront language code — anything else is ignored rather than queried. */
const LANG = /^[a-z]{2}$/;

/**
 * Visible text of the short description, which the admin writes in a
 * WYSIWYG: search results and the index want words, not `<p><strong>`.
 */
function plainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseLang(lang?: string): string | null {
  const l = lang?.trim().toLowerCase();
  return l && LANG.test(l) ? l : null;
}

/**
 * The product's title in `lang`, or NULL. A scalar subquery so it can sit in
 * a WHERE, a SELECT or an ORDER BY without a join changing the row count.
 */
function localizedField(field: 'title' | 'shortDescription', lang: string | null): Prisma.Sql {
  if (!lang) return Prisma.sql`NULL::text`;
  return Prisma.sql`(SELECT t.value FROM translations t WHERE t."entityType" = ${ET_SHOP_PRODUCT} AND t."entityId" = p.id AND t.field = ${field} AND t.lang = ${lang} LIMIT 1)`;
}

/**
 * Does `term` (an ILIKE pattern) occur anywhere a shopper would recognise the
 * product by, in their language?
 *
 * The product's own columns are its base language — not necessarily English —
 * and the translations add the shopper's. Category names count too (base and
 * translated): a shop that has translated "Caps" into "Casquettes" but not
 * every cap's title still answers a French shopper typing "casquette".
 *
 * A multi-word query needs every word to match (somewhere — "red cap" may be
 * a red product in the Caps category), not any one of them: in French or
 * German "de", "la" or "en" alone would otherwise match the whole catalogue.
 */
function matchesTerm(term: string, lang: string | null): Prisma.Sql {
  const translated = lang
    ? Prisma.sql`
        OR EXISTS (SELECT 1 FROM translations t
                   WHERE t."entityType" = ${ET_SHOP_PRODUCT} AND t."entityId" = p.id AND t.lang = ${lang}
                     AND t.field IN ('title', 'shortDescription') AND t.value ILIKE ${term})`
    : Prisma.empty;
  const categoryTranslation = lang
    ? Prisma.sql`OR EXISTS (SELECT 1 FROM translations ct
                            WHERE ct."entityType" = ${ET_SHOP_CATEGORY} AND ct."entityId" = c.id AND ct.field = 'name'
                              AND ct.lang = ${lang} AND ct.value ILIKE ${term})`
    : Prisma.empty;
  return Prisma.sql`(
    p.title ILIKE ${term}
    OR p."shortDescription" ILIKE ${term}
    OR p.brand ILIKE ${term}
    OR p.sku ILIKE ${term}
    ${translated}
    OR EXISTS (SELECT 1 FROM "_ProductCategoryMap" m JOIN shop_product_categories c ON c.id = m."B"
               WHERE m."A" = p.id AND (c.name ILIKE ${term} ${categoryTranslation}))
  )`;
}

export interface SearchFilters {
  category?: string;
  tag?: string;
  brand?: string;
  minPrice?: number; // cents
  maxPrice?: number; // cents
}

export interface SearchResult {
  hits: any[];
  total: number;
  facets: Record<string, Record<string, number>>;
  query: string;
  processingTimeMs: number;
}

/** One suggestion, with everything the dropdown draws. */
export interface AutocompleteItem {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  priceCents: number;
  ratingAverage: number;
  reviewCount: number;
  categoryId: string | null;
  categoryName: string | null;
}

interface IndexableProduct {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  brand: string | null;
  sku: string | null;
  status: string;
  featured: boolean;
  featuredImageKey: string | null;
  basePriceCents: number | null;
  createdAt: Date;
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}

/**
 * Product search: Meilisearch-backed when configured, otherwise a Postgres
 * full-text/ILIKE fallback that returns the exact same response shape — the
 * storefront never needs to know which one answered a query. Mirrors
 * vitecamio's commerce/catalog/product-search.service.ts.
 */
@Injectable()
export class ProductSearchService implements OnModuleInit {
  private readonly logger = new Logger(ProductSearchService.name);

  constructor(
    private readonly meili: MeilisearchService,
    private readonly assetUrl: AssetUrlService,
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
  ) {}

  get isEnabled(): boolean {
    return this.meili.isEnabled;
  }

  async onModuleInit(): Promise<void> {
    if (!this.meili.isEnabled) return;
    try {
      await this.meili.configureIndex(INDEX, 'id', {
        searchableAttributes: ['title', 'shortDescription', 'brand', 'sku', 'categoryNames', 'tagNames', 'translatedText'],
        filterableAttributes: ['status', 'brand', 'categoryIds', 'tagIds', 'minPriceCents'],
        sortableAttributes: ['minPriceCents', 'createdAt', 'title'],
        faceting: { maxValuesPerFacet: 50 },
        pagination: { maxTotalHits: 1000 },
      });
      this.logger.log('Meilisearch product index configured');
    } catch (err) {
      this.logger.error('Failed to configure Meilisearch index', (err as Error).message);
    }
  }

  // ── Index a single product ────────────────────────────────────────────────

  async indexProduct(product: IndexableProduct): Promise<void> {
    if (!this.meili.isEnabled) return;

    // Every variant's effective price, with null meaning "inherit the product's
    // base" — aggregating the raw column instead would ignore the base entirely
    // whenever at least one variant carries an override.
    const variantRows = await this.prisma.productVariant.findMany({
      where: { productId: product.id },
      select: { priceCents: true },
    });
    const prices = variantRows.map((v) => v.priceCents ?? product.basePriceCents ?? 0);
    const minPriceCents = prices.length ? Math.min(...prices) : (product.basePriceCents ?? 0);
    const maxPriceCents = prices.length ? Math.max(...prices) : (product.basePriceCents ?? 0);

    const translatedText = (await this.translatedTextFor([product.id], product.categories.map((c) => c.id))).get(product.id) ?? '';
    const doc = {
      translatedText,
      id: product.id,
      slug: product.slug,
      title: product.title,
      shortDescription: plainText(product.shortDescription),
      brand: product.brand ?? '',
      sku: product.sku ?? '',
      status: product.status,
      featured: product.featured,
      minPriceCents,
      maxPriceCents,
      categoryIds: product.categories.map((c) => c.id),
      categoryNames: product.categories.map((c) => c.name).join(' '),
      tagIds: product.tags.map((t) => t.id),
      tagNames: product.tags.map((t) => t.name).join(' '),
      featuredImageKey: product.featuredImageKey ?? null,
      createdAt: product.createdAt.toISOString(),
    };

    await this.meili.index(INDEX).addDocuments([doc]);
  }

  async removeFromIndex(productId: string): Promise<void> {
    if (!this.meili.isEnabled) return;
    await this.meili.index(INDEX).deleteDocument(productId);
  }

  // ── Bulk index all active products (initial sync / re-index) ─────────────

  async reindexAll(): Promise<{ indexed: number }> {
    if (!this.meili.isEnabled) return { indexed: 0 };

    const products = await this.prisma.product.findMany({
      where: { status: 'active', deletedAt: null, isService: false },
      include: { categories: { select: { id: true, name: true } }, tags: { select: { id: true, name: true } } },
    });

    const variants = await this.prisma.productVariant.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      select: { productId: true, priceCents: true },
    });
    // Same fallback as indexProduct: a null override means the product's base
    // price, so skipping those rows would drop the cheapest option from the
    // index whenever a product mixes overridden and inherited variants.
    const baseByProduct = new Map(products.map((p) => [p.id, p.basePriceCents ?? 0]));
    const pricesByProduct = new Map<string, number[]>();
    for (const v of variants) {
      const arr = pricesByProduct.get(v.productId) ?? [];
      arr.push(v.priceCents ?? baseByProduct.get(v.productId) ?? 0);
      pricesByProduct.set(v.productId, arr);
    }

    const textByProduct = await this.translatedTextFor(
      products.map((p) => p.id),
      [...new Set(products.flatMap((p) => p.categories.map((c) => c.id)))],
      new Map(products.map((p) => [p.id, p.categories.map((c) => c.id)])),
    );

    const docs = products.map((p) => {
      const prices = pricesByProduct.get(p.id) ?? [];
      const minPriceCents = prices.length ? Math.min(...prices) : (p.basePriceCents ?? 0);
      const maxPriceCents = prices.length ? Math.max(...prices) : (p.basePriceCents ?? 0);
      return {
        translatedText: textByProduct.get(p.id) ?? '',
        id: p.id,
        slug: p.slug,
        title: p.title,
        shortDescription: plainText(p.shortDescription),
        brand: p.brand ?? '',
        sku: p.sku ?? '',
        status: p.status,
        featured: p.featured,
        minPriceCents,
        maxPriceCents,
        categoryIds: p.categories.map((c) => c.id),
        categoryNames: p.categories.map((c) => c.name).join(' '),
        tagIds: p.tags.map((t) => t.id),
        tagNames: p.tags.map((t) => t.name).join(' '),
        featuredImageKey: p.featuredImageKey ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    });

    if (docs.length) await this.meili.index(INDEX).addDocuments(docs);
    return { indexed: docs.length };
  }

  /**
   * Every translated title, short description and category name of each
   * product, in every language, as one string — Meilisearch's way into other
   * languages. One index serves all of them; a shopper's query matching another
   * language's word is harmless, and the hits are shown translated anyway.
   *
   * Edits to a translation alone do not re-index: run the admin reindex after
   * a translation pass.
   */
  private async translatedTextFor(productIds: string[], categoryIds: string[], categoriesByProduct?: Map<string, string[]>): Promise<Map<string, string>> {
    const [productRows, categoryRows] = await Promise.all([
      this.prisma.translation.findMany({
        where: { entityType: ET_SHOP_PRODUCT, entityId: { in: productIds }, field: { in: ['title', 'shortDescription'] } },
        select: { entityId: true, value: true },
      }),
      categoryIds.length
        ? this.prisma.translation.findMany({ where: { entityType: ET_SHOP_CATEGORY, entityId: { in: categoryIds }, field: 'name' }, select: { entityId: true, value: true } })
        : Promise.resolve([]),
    ]);
    const categoryText = new Map<string, string[]>();
    for (const r of categoryRows) categoryText.set(r.entityId, [...(categoryText.get(r.entityId) ?? []), r.value]);

    const out = new Map<string, string[]>();
    for (const r of productRows) out.set(r.entityId, [...(out.get(r.entityId) ?? []), plainText(r.value)]);
    for (const id of productIds) {
      const cats = categoriesByProduct?.get(id) ?? categoryIds;
      out.set(id, [...(out.get(id) ?? []), ...cats.flatMap((c) => categoryText.get(c) ?? [])]);
    }
    return new Map([...out].map(([id, parts]) => [id, parts.join(' ')]));
  }

  // ── Faceted search ────────────────────────────────────────────────────────

  /**
   * `lang` makes the search answer in the shopper's language: matched against
   * that language's titles, descriptions and category names as well as the
   * base ones, and returned with the translated title and short description.
   */
  async search(query: string, filters: SearchFilters = {}, page = 1, hitsPerPage = 24, lang?: string): Promise<SearchResult> {
    const language = normaliseLang(lang);
    const result = this.meili.isEnabled ? await this.searchMeili(query, filters, page, hitsPerPage) : await this.searchDb(query, filters, page, hitsPerPage, language);
    if (language) result.hits = await this.translations.maybeApply(result.hits, ET_SHOP_PRODUCT, language);

    const keys = result.hits.map((h: any) => h.featuredImageKey).filter((k: any): k is string => !!k);
    const urlMap = await this.assetUrl.resolveBatch(keys);
    result.hits = result.hits.map((h: any) => ({
      ...h,
      featuredImageUrl: h.featuredImageKey ? (urlMap.get(h.featuredImageKey) ?? null) : null,
    }));

    return result;
  }

  private async searchMeili(query: string, filters: SearchFilters, page: number, hitsPerPage: number): Promise<SearchResult> {
    const filterParts: string[] = ['status = "active"'];
    if (filters.category) filterParts.push(`categoryIds = "${filters.category}"`);
    if (filters.tag) filterParts.push(`tagIds = "${filters.tag}"`);
    if (filters.brand) filterParts.push(`brand = "${filters.brand}"`);
    if (filters.minPrice) filterParts.push(`minPriceCents >= ${filters.minPrice}`);
    if (filters.maxPrice) filterParts.push(`minPriceCents <= ${filters.maxPrice}`);

    const result = await this.meili.index(INDEX).search(query, {
      filter: filterParts.join(' AND '),
      facets: ['brand', 'categoryIds', 'tagIds'],
      hitsPerPage,
      page,
    });

    return {
      hits: result.hits,
      total: result.totalHits ?? result.estimatedTotalHits ?? 0,
      facets: result.facetDistribution ?? {},
      query,
      processingTimeMs: result.processingTimeMs,
    };
  }

  // PostgreSQL full-text fallback — mirrors the Meilisearch response shape.
  private async searchDb(query: string, filters: SearchFilters, page: number, hitsPerPage: number, lang: string | null): Promise<SearchResult> {
    const t0 = Date.now();
    const q = query.trim();

    // Service products (the hidden "your own item" one) are reached from
    // their own page, never from search — as autocomplete and the index have it.
    const conditions: Prisma.Sql[] = [Prisma.sql`p.status = 'active'`, Prisma.sql`p."deletedAt" IS NULL`, Prisma.sql`p."isService" = false`];
    const words = q ? q.split(/\s+/).filter((w) => w.length >= 2) : [];

    const locTitle = localizedField('title', lang);
    const locShort = localizedField('shortDescription', lang);

    if (q) {
      const like = `%${q}%`;
      const wordClauses = words.length > 1 ? words.map((w) => matchesTerm('%' + w + '%', lang)) : [];

      conditions.push(Prisma.sql`(
        ${matchesTerm(like, lang)}
        OR to_tsvector('simple', coalesce(p.title,'') || ' ' || coalesce(p."shortDescription",'') || ' ' || coalesce(p.brand,'') || ' ' || coalesce(p.sku,''))
           @@ plainto_tsquery('simple', ${q})
        ${wordClauses.length ? Prisma.sql`OR (${Prisma.join(wordClauses, ' AND ')})` : Prisma.empty}
      )`);
    }

    if (filters.brand) conditions.push(Prisma.sql`p.brand = ${filters.brand}`);
    if (filters.category) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "_ProductCategoryMap" m WHERE m."A" = p.id AND m."B" = ${filters.category}::uuid)`);
    if (filters.tag) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "_ProductTagMap" m WHERE m."A" = p.id AND m."B" = ${filters.tag}::uuid)`);

    const where = Prisma.join(conditions, ' AND ');

    let priceHaving = Prisma.empty;
    if (filters.minPrice) priceHaving = Prisma.sql`${priceHaving} AND min_price >= ${filters.minPrice}`;
    if (filters.maxPrice) priceHaving = Prisma.sql`${priceHaving} AND min_price <= ${filters.maxPrice}`;

    // Rank: full-phrase match gets 1000 points, each individual word match adds 1,
    // ts_rank is a tiebreaker within the same tier.
    let rankSelect = Prisma.sql`, 0 AS rank_score`;
    if (q) {
      // The title the shopper reads is the translated one where it exists, so
      // that is what earns the phrase boost; a category-only match ranks last.
      const phraseBoost = Prisma.sql`CASE WHEN COALESCE(${locTitle}, p.title) ILIKE ${'%' + q + '%'} OR p.title ILIKE ${'%' + q + '%'} OR p.brand ILIKE ${'%' + q + '%'} THEN 1000 ELSE 0 END`;
      const wordBoosts = words.map((w) => Prisma.sql`CASE WHEN COALESCE(${locTitle}, p.title) ILIKE ${'%' + w + '%'} OR COALESCE(${locShort}, p."shortDescription") ILIKE ${'%' + w + '%'} OR p.title ILIKE ${'%' + w + '%'} OR p.brand ILIKE ${'%' + w + '%'} OR p."shortDescription" ILIKE ${'%' + w + '%'} THEN 1 ELSE 0 END`);
      const wordBoostSum = wordBoosts.length ? Prisma.join(wordBoosts.map((b) => Prisma.sql`+ ${b}`), ' ') : Prisma.empty;
      const tsRank = Prisma.sql`ts_rank(to_tsvector('simple', coalesce(p.title,'') || ' ' || coalesce(p."shortDescription",'')), plainto_tsquery('simple', ${q}))`;
      rankSelect = Prisma.sql`, (${phraseBoost} ${wordBoostSum}) + ${tsRank} AS rank_score`;
    }

    const limit = hitsPerPage;
    const offset = (page - 1) * hitsPerPage;

    const hitsQuery = Prisma.sql`
      SELECT sub.*
      FROM (
        SELECT
          p.id, p.slug, p.title, p."shortDescription", p.brand, p.sku,
          p."featuredImageKey", p.featured, p."createdAt",
          /* A variant's priceCents is an *override*: null means "use the
             product's basePriceCents" (see the schema comment on that column).
             A raw MIN over it returns null for every product priced at the
             product level, which the mapper below then read as a price of 0 —
             the whole search page quoted €0.00. The Meilisearch indexer has
             always applied this same fallback; only this path had not. */
          MIN(COALESCE(v."priceCents", p."basePriceCents")) AS min_price
          ${rankSelect}
        FROM shop_products p
        LEFT JOIN shop_product_variants v ON v."productId" = p.id
        WHERE ${where}
        GROUP BY p.id
      ) sub
      WHERE 1=1 ${priceHaving}
      ORDER BY sub.featured DESC, sub.rank_score DESC, sub."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countQuery = Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM (
        /* Same COALESCE as the hits query — this one feeds the min/max price
           filter, which would otherwise exclude every product priced at the
           product level. */
        SELECT p.id, MIN(COALESCE(v."priceCents", p."basePriceCents")) AS min_price
        FROM shop_products p
        LEFT JOIN shop_product_variants v ON v."productId" = p.id
        WHERE ${where}
        GROUP BY p.id
      ) sub
      WHERE 1=1 ${priceHaving}
    `;

    const brandFacetQuery = Prisma.sql`
      SELECT p.brand, COUNT(*)::int AS cnt
      FROM shop_products p
      WHERE p.brand IS NOT NULL AND p.brand != ''
        AND ${where}
      GROUP BY p.brand
      ORDER BY cnt DESC
      LIMIT 30
    `;

    const [rows, countRows, brandRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>(hitsQuery),
      this.prisma.$queryRaw<Array<{ total: number }>>(countQuery),
      this.prisma.$queryRaw<Array<{ brand: string; cnt: number }>>(brandFacetQuery),
    ]);

    const hits = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      shortDescription: plainText(r.shortDescription),
      brand: r.brand ?? '',
      sku: r.sku ?? '',
      featuredImageKey: r.featuredImageKey ?? null,
      // Null only survives now when a product has no price anywhere at all.
      minPriceCents: r.min_price != null ? Number(r.min_price) : null,
    }));

    const brandFacets: Record<string, number> = {};
    for (const row of brandRows) brandFacets[row.brand] = row.cnt;

    return {
      hits,
      total: countRows[0]?.total ?? 0,
      facets: { brand: brandFacets },
      query,
      processingTimeMs: Date.now() - t0,
    };
  }

  // ── Autocomplete ──────────────────────────────────────────────────────────

  /**
   * Matching product ids, best first. Whichever engine is running only has to
   * answer "which products, in what order" — everything the dropdown actually
   * renders is loaded from the database below, so the two paths can't drift.
   */
  private async autocompleteIds(q: string, limit: number, lang: string | null): Promise<string[]> {
    if (this.meili.isEnabled) {
      const result = await this.meili.index(INDEX).search(q, {
        filter: 'status = "active"',
        attributesToRetrieve: ['id'],
        hitsPerPage: limit,
        page: 1,
      });
      return result.hits.map((h: any) => h.id as string);
    }

    const like = `%${q}%`;
    const words = q.split(/\s+/).filter((w) => w.length >= 2);
    const wordClauses = words.length > 1 ? words.map((w) => matchesTerm('%' + w + '%', lang)) : [];
    const locTitle = localizedField('title', lang);

    // Title matches first — in the shopper's language, then the base one — so
    // a product named for the query leads one that only shares its category.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id
      FROM shop_products p
      WHERE p.status = 'active'
        AND p."deletedAt" IS NULL
        AND p."isService" = false
        AND (${matchesTerm(like, lang)}
          ${wordClauses.length ? Prisma.sql`OR (${Prisma.join(wordClauses, ' AND ')})` : Prisma.empty})
      ORDER BY
        CASE WHEN COALESCE(${locTitle}, p.title) ILIKE ${like} OR p.title ILIKE ${like} THEN 0 ELSE 1 END,
        p.featured DESC, p."createdAt" DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => r.id);
  }

  /**
   * Suggestions rich enough to decide from without leaving the dropdown: a
   * photo, the brand, the price the card would show, and the review score.
   *
   * `category` is carried on each item rather than the response being
   * pre-grouped — the order here is relevance, and the client groups while
   * preserving it, so the best match still leads.
   */
  async autocomplete(query: string, limit = 12, lang?: string): Promise<AutocompleteItem[]> {
    const q = query.trim();
    if (!q) return [];
    const language = normaliseLang(lang);

    const ids = await this.autocompleteIds(q, limit, language);
    if (!ids.length) return [];

    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids }, status: 'active', deletedAt: null, isService: false },
      select: {
        id: true,
        slug: true,
        title: true,
        brand: true,
        featuredImageKey: true,
        basePriceCents: true,
        ratingAverage: true,
        reviewCount: true,
        primaryCategory: { select: { id: true, name: true } },
        categories: { select: { id: true, name: true } },
        variants: { select: { priceCents: true, isDefault: true } },
      },
    });

    // Titles and category names in the shopper's language — the grouping
    // headers in the dropdown are category names too.
    const products = language ? await this.translations.maybeApply(rows, ET_SHOP_PRODUCT, language) : rows;
    if (language) {
      const cats = [...new Map(products.flatMap((p) => [p.primaryCategory, ...p.categories]).filter((c): c is { id: string; name: string } => !!c).map((c) => [c.id, c])).values()];
      const named = new Map((await this.translations.maybeApply(cats, ET_SHOP_CATEGORY, language)).map((c) => [c.id, c.name]));
      for (const p of products) {
        if (p.primaryCategory) p.primaryCategory = { ...p.primaryCategory, name: named.get(p.primaryCategory.id) ?? p.primaryCategory.name };
        p.categories = p.categories.map((c) => ({ ...c, name: named.get(c.id) ?? c.name }));
      }
    }

    // findMany's order has nothing to do with relevance — put it back.
    const rank = new Map(ids.map((id, i) => [id, i]));
    products.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

    const keys = products.map((p) => p.featuredImageKey).filter((k): k is string => !!k);
    const urlMap = keys.length ? await this.assetUrl.resolveBatch(keys) : new Map<string, string>();

    return products.map((p) => {
      // Mirrors ProductCard: the default variant's own price, falling back to
      // the product's base — so the dropdown never quotes a different number
      // from the card the shopper lands on.
      const def = p.variants.find((v) => v.isDefault) ?? p.variants[0];
      const category = p.primaryCategory ?? p.categories[0] ?? null;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        imageUrl: p.featuredImageKey ? (urlMap.get(p.featuredImageKey) ?? null) : null,
        priceCents: def?.priceCents ?? p.basePriceCents ?? 0,
        ratingAverage: Number(p.ratingAverage),
        reviewCount: p.reviewCount,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
      };
    });
  }
}
