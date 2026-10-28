import { CartService } from './cart.service';

/** One brand per basket: a Silomis product and a neutral brand's never share an order. */
describe('CartService — one store brand per basket', () => {
  function check(inBasket: Array<string | null>, adding: string | null) {
    const prisma = { product: { findMany: jest.fn(async () => inBasket.map((storeBrandId) => ({ storeBrandId }))) } };
    const service = new CartService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const items = inBasket.map((_, i) => ({ productId: `p${i}` }));
    return (service as unknown as { assertSameStoreBrand(i: unknown[], b: string | null): Promise<void> }).assertSameStoreBrand(items, adding);
  }

  it('lets anything into an empty basket', async () => {
    await expect(check([], 'brew')).resolves.toBeUndefined();
  });

  it('adds to a basket of the same brand, or of Silomis', async () => {
    await expect(check(['brew', 'brew'], 'brew')).resolves.toBeUndefined();
    await expect(check([null], null)).resolves.toBeUndefined();
  });

  it('refuses a brand product in a Silomis basket, and the other way round', async () => {
    await expect(check([null], 'brew')).rejects.toMatchObject({ response: { code: 'OTHER_STORE_IN_CART' } });
    await expect(check(['brew'], null)).rejects.toMatchObject({ response: { code: 'OTHER_STORE_IN_CART' } });
    await expect(check(['brew'], 'other')).rejects.toMatchObject({ response: { code: 'OTHER_STORE_IN_CART' } });
  });
});
