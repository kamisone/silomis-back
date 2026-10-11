import { ProductSearchService } from './product-search.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MeilisearchService } from '../../meilisearch/meilisearch.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_CATEGORY, ET_SHOP_PRODUCT } from '../../translations/translation-entities';

const CAPS = { id: 'cat-caps', name: 'Caps' };

const PRODUCT = {
  id: 'p1',
  slug: 'red-cap',
  title: 'Red cap',
  brand: null,
  featuredImageKey: null,
  basePriceCents: 1990,
  ratingAverage: 4.5,
  reviewCount: 3,
  primaryCategory: CAPS,
  categories: [CAPS],
  variants: [{ priceCents: null, isDefault: true }],
};

/** Overlay rows by entity type → id → field, as the translations table would hold them for one language. */
const FR: Record<string, Record<string, Record<string, string>>> = {
  [ET_SHOP_PRODUCT]: { p1: { title: 'Casquette rouge' } },
  [ET_SHOP_CATEGORY]: { 'cat-caps': { name: 'Casquettes' } },
};

function build() {
  const queryRaw = jest.fn().mockResolvedValue([{ id: 'p1' }]);
  const prisma = {
    $queryRaw: queryRaw,
    product: { findMany: jest.fn().mockResolvedValue([PRODUCT]) },
  } as unknown as PrismaService;
  const meili = { isEnabled: false } as unknown as MeilisearchService;
  const assetUrl = { resolveBatch: jest.fn().mockResolvedValue(new Map()) } as unknown as AssetUrlService;
  const maybeApply = jest.fn(<T extends Record<string, unknown>>(items: T[], entityType: string, lang?: string) =>
    Promise.resolve(lang === 'fr' ? items.map((it) => ({ ...it, ...(FR[entityType]?.[it.id as string] ?? {}) })) : items),
  );
  const translations = { maybeApply } as unknown as TranslationsService;
  return { service: new ProductSearchService(meili, assetUrl, prisma, translations), queryRaw, maybeApply };
}

/** The SQL text and bound values of a Prisma.sql template, flattened for assertions. */
function sqlOf(call: unknown[]): { text: string; values: unknown[] } {
  const sql = call[0] as { strings: readonly string[]; values: unknown[] };
  return { text: sql.strings.join('?'), values: sql.values };
}

describe('ProductSearchService — shopper language', () => {
  it('answers in the requested language: product title and category name', async () => {
    const { service } = build();
    const [item] = await service.autocomplete('casquette', 12, 'fr');
    expect(item.title).toBe('Casquette rouge');
    expect(item.categoryName).toBe('Casquettes');
  });

  it('matches against that language in SQL, not only the base columns', async () => {
    const { service, queryRaw } = build();
    await service.autocomplete('casquette', 12, 'fr');
    const { text, values } = sqlOf(queryRaw.mock.calls[0]);
    expect(text).toContain('FROM translations t');
    expect(values).toContain('fr');
    expect(values).toContain(ET_SHOP_CATEGORY);
  });

  it('keeps the base text and skips translation lookups without a language', async () => {
    const { service, queryRaw, maybeApply } = build();
    const [item] = await service.autocomplete('cap', 12);
    expect(item.title).toBe('Red cap');
    expect(item.categoryName).toBe('Caps');
    expect(maybeApply).not.toHaveBeenCalled();
    expect(sqlOf(queryRaw.mock.calls[0]).text).not.toContain('FROM translations');
  });

  it('ignores a language that is not a two-letter code', async () => {
    const { service, queryRaw, maybeApply } = build();
    await service.autocomplete('cap', 12, "fr' OR 1=1 --");
    expect(maybeApply).not.toHaveBeenCalled();
    expect(sqlOf(queryRaw.mock.calls[0]).text).not.toContain('FROM translations');
  });

  it('needs every word of a multi-word query, so short words cannot match everything', async () => {
    const { service, queryRaw } = build();
    await service.autocomplete('casquette de laine', 12, 'fr');
    const { text } = sqlOf(queryRaw.mock.calls[0]);
    // Word clauses are joined with AND; the phrase itself is still an OR alternative.
    expect(text).toMatch(/\)\s*AND\s*\(/);
  });
});
