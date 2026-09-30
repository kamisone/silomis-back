import { ProductsService } from './products.service';

/**
 * Browsing a branch category shows everything under it.
 *
 * The storefront's category filter used to be one exact id, so a shopper opening
 * "Caps" saw only products somebody had filed on the branch itself rather than in
 * "Snapbacks" or "Trucker caps" — which in a tidy catalogue is none of them. The
 * page could not show a grid at all, and the listing fell back to subcategory
 * tiles with nothing below them.
 */
function makeService(subtree: string[]) {
  const findMany = jest.fn(async (_args?: unknown) => [] as unknown[]);
  const queryRaw = jest.fn(async () => subtree.map((id) => ({ id })));
  const prisma = {
    product: { findMany, count: jest.fn(async () => 0) },
    productVariant: { findMany: jest.fn(async () => []) },
    inventoryItem: { findMany: jest.fn(async () => []) },
    $queryRaw: queryRaw,
  };
  const assetUrls = { resolveBatch: jest.fn(async () => new Map<string, string>()) };
  const translations = { maybeApply: jest.fn(async (rows: unknown[]) => rows) };
  const service = new ProductsService(
    prisma as never,
    assetUrls as never,
    null as never,
    translations as never,
    null as never,
    null as never,
  );
  return { service, findMany, queryRaw };
}

async function whereFor(filter: Record<string, unknown>, subtree: string[]) {
  const { service, findMany } = makeService(subtree);
  await service.publicList(filter as never);
  const args = findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined;
  return args?.where ?? {};
}

describe('publicList — category subtree', () => {
  it('asks for every category under the one browsed, not just that one', async () => {
    const where = await whereFor({ categoryId: 'caps' }, ['caps', 'snapbacks', 'truckers']);
    expect(where).toMatchObject({
      categories: { some: { id: { in: ['caps', 'snapbacks', 'truckers'] } } },
    });
  });

  it('is just the leaf itself for a category with no children', async () => {
    const where = await whereFor({ categoryId: 'snapbacks' }, ['snapbacks']);
    expect(where).toMatchObject({ categories: { some: { id: { in: ['snapbacks'] } } } });
  });

  it('falls back to the id alone when the category is not there', async () => {
    // An empty `in` list matches EVERY product in Prisma, not none — so a
    // deleted or mistyped id has to narrow to nothing rather than to everything.
    const where = await whereFor({ categoryId: 'gone' }, []);
    expect(where).toMatchObject({ categories: { some: { id: { in: ['gone'] } } } });
  });

  it('does not touch the category table when nothing was asked of it', async () => {
    const { service, queryRaw, findMany } = makeService([]);
    await service.publicList({});
    expect(queryRaw).not.toHaveBeenCalled();
    const where = (findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> })?.where ?? {};
    expect(where).not.toHaveProperty('categories');
  });
});
