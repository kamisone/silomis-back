import { ReviewsService } from './reviews.service';

function make(rows: Array<{ ratingAverage: number; reviewCount: number }>) {
  const prisma = { product: { findMany: jest.fn().mockResolvedValue(rows) } };
  const service = new ReviewsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe('ReviewsService.getSummary', () => {
  it('weights each product by its review count', async () => {
    const { service } = make([
      { ratingAverage: 5, reviewCount: 1 },
      { ratingAverage: 4, reviewCount: 9 },
    ]);
    await expect(service.getSummary(['a', 'b'])).resolves.toEqual({ average: 4.1, count: 10 });
  });

  it('returns nothing to show when no product has reviews', async () => {
    const { service } = make([]);
    await expect(service.getSummary(['a'])).resolves.toEqual({ average: 0, count: 0 });
  });

  it('does not query for an empty list, and de-duplicates ids', async () => {
    const { service, prisma } = make([]);
    await service.getSummary(['', ' ']);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    await service.getSummary(['a', 'a', ' b ']);
    expect(prisma.product.findMany.mock.calls[0][0].where.id.in).toEqual(['a', 'b']);
  });
});
