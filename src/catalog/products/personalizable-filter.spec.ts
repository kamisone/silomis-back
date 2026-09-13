import { ProductsService } from './products.service';

/**
 * The placement studio's product picker is restricted to products
 * personalisation is switched on for. That has to be a database filter rather
 * than a filter over what comes back: the list is paged, so filtering the page
 * would show an empty dropdown whenever the first ten happened to be ordinary
 * products — and the admin would conclude there were none.
 */
function makeService() {
  // Typed loosely on purpose: the assertion is about the `where` argument, and
  // giving the mock Prisma's real signature would drag the whole generated
  // client into a test that does not touch a database.
  const findMany = jest.fn(async (_args?: unknown) => [] as unknown[]);
  const prisma = {
    product: { findMany, count: jest.fn(async () => 0) },
    productVariant: { findMany: jest.fn(async () => []) },
    inventoryItem: { findMany: jest.fn(async () => []) },
  };
  const noop = {} as never;
  const assetUrls = { resolveBatch: jest.fn(async () => new Map<string, string>()) };
  const service = new ProductsService(prisma as never, assetUrls as never, noop, noop, noop, noop);
  return { service, findMany };
}

/** The `where` the service handed to Prisma. */
async function whereFor(filter: Record<string, unknown>) {
  const { service, findMany } = makeService();
  await service.adminList(filter as never);
  const args = findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined;
  return args?.where ?? {};
}

describe('adminList — personalizable filter', () => {
  it('asks the database for products that have a template', async () => {
    expect(await whereFor({ personalizable: true })).toMatchObject({
      personalizationTemplateId: { not: null },
    });
  });

  it('asks for those that have none when inverted', async () => {
    expect(await whereFor({ personalizable: false })).toMatchObject({
      personalizationTemplateId: null,
    });
  });

  it('does not constrain the list at all when the filter is absent', async () => {
    // Regression guard: an `undefined` that leaked into the where as
    // `personalizationTemplateId: undefined` would be harmless in Prisma, but a
    // `null` would silently hide every personalisable product from every other
    // screen that lists products.
    expect(await whereFor({})).not.toHaveProperty('personalizationTemplateId');
  });

  it('combines with the other filters rather than replacing them', async () => {
    const where = await whereFor({ personalizable: true, status: 'active', search: 'cap' });
    expect(where).toMatchObject({ status: 'active', personalizationTemplateId: { not: null } });
    expect(where.OR).toBeDefined();
  });
});
