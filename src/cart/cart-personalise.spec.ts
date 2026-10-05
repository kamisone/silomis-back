import { CartService } from './cart.service';
import { sameLines } from '../checkout/checkout.service';

/**
 * Personalising a line already in the basket: one unit moves from the plain
 * line to a new embroidered one, and the basket is untouched if the design
 * is refused.
 */
describe('CartService.personaliseItem', () => {
  const DESIGN = [{ placementKey: 'front', text: 'LEA' }] as never;

  function setup(line: { quantity: number; personalizationHash?: string }) {
    const item = {
      id: 'line-1',
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: line.quantity,
      personalizationHash: line.personalizationHash ?? '',
      optionsSnapshot: [{ optionValueId: 'red' }, { optionValueId: null }],
    };
    const prisma = {
      cart: { findFirst: jest.fn(async () => ({ id: 'cart-1', items: [item] })) },
      cartItem: { update: jest.fn(), delete: jest.fn() },
    };
    const service = new CartService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const addItem = jest.spyOn(service, 'addItem').mockResolvedValue({} as never);
    jest.spyOn(service as never, 'repriceProductLines').mockResolvedValue(undefined as never);
    jest.spyOn(service, 'getOrCreate').mockResolvedValue({ items: [] } as never);
    return { service, prisma, addItem };
  }

  it('adds one embroidered unit with the same options, untracked', async () => {
    const { service, addItem } = setup({ quantity: 2 });

    await service.personaliseItem('tok', 'line-1', DESIGN, 'fr');

    expect(addItem).toHaveBeenCalledWith('tok', 'var-1', 1, ['red'], 'fr', undefined, DESIGN, { track: false });
  });

  it('takes one unit off a plain line of two', async () => {
    const { service, prisma } = setup({ quantity: 2 });

    await service.personaliseItem('tok', 'line-1', DESIGN);

    expect(prisma.cartItem.update).toHaveBeenCalledWith({ where: { id: 'line-1' }, data: { quantity: 1 } });
    expect(prisma.cartItem.delete).not.toHaveBeenCalled();
  });

  it('replaces a plain line of one', async () => {
    const { service, prisma } = setup({ quantity: 1 });

    await service.personaliseItem('tok', 'line-1', DESIGN);

    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'line-1' } });
  });

  it('leaves the basket untouched when the design is refused', async () => {
    const { service, prisma, addItem } = setup({ quantity: 1 });
    addItem.mockRejectedValueOnce(new Error('TEXT_TOO_LONG'));

    await expect(service.personaliseItem('tok', 'line-1', DESIGN)).rejects.toThrow('TEXT_TOO_LONG');
    expect(prisma.cartItem.delete).not.toHaveBeenCalled();
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });

  it('refuses a line that is already personalised', async () => {
    const { service, addItem } = setup({ quantity: 1, personalizationHash: 'abc' });

    await expect(service.personaliseItem('tok', 'line-1', DESIGN)).rejects.toBeDefined();
    expect(addItem).not.toHaveBeenCalled();
  });
});

/** Whether a draft order can be resumed or has to be rebuilt from the cart. */
describe('sameLines (checkout resume)', () => {
  const plain = { variantId: 'v1', quantity: 2, unitPriceCents: 2500, personalizations: [] };
  const embroidered = {
    variantId: 'v1',
    quantity: 1,
    unitPriceCents: 3400,
    personalizations: [{ placementKey: 'front', text: 'LEA', designJson: { v: 1 } }],
  };

  it('matches identical lines in any order', () => {
    expect(sameLines([plain, embroidered], [embroidered, plain])).toBe(true);
  });

  it('sees a line personalised since the order was created', () => {
    expect(sameLines([{ ...plain, quantity: 1 }, embroidered], [plain])).toBe(false);
  });

  it('sees a changed quantity', () => {
    expect(sameLines([{ ...plain, quantity: 3 }], [plain])).toBe(false);
  });

  it('sees changed embroidery text', () => {
    const edited = { ...embroidered, personalizations: [{ placementKey: 'front', text: 'LÉA', designJson: { v: 1 } }] };
    expect(sameLines([edited], [embroidered])).toBe(false);
  });
});

/** Changing or removing the embroidery on a line already personalised. */
describe('CartService — change / remove a line design', () => {
  const DESIGN = [{ placementKey: 'front', text: 'TOM' }] as never;

  function setup(newHash: string) {
    const item = {
      id: 'line-1',
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 2,
      personalizationHash: 'old-hash',
      optionsSnapshot: [{ optionValueId: 'red' }],
    };
    const prisma = {
      cart: { findFirst: jest.fn(async () => ({ id: 'cart-1', items: [item] })) },
      cartItem: { update: jest.fn(), delete: jest.fn() },
    };
    const personalization = { resolveSet: jest.fn(async () => ({ hash: newHash, designs: [], totalCents: 0 })) };
    const service = new CartService(prisma as never, {} as never, {} as never, {} as never, personalization as never, {} as never, {} as never, {} as never, {} as never);
    const addItem = jest.spyOn(service, 'addItem').mockResolvedValue({} as never);
    jest.spyOn(service as never, 'repriceProductLines').mockResolvedValue(undefined as never);
    jest.spyOn(service, 'getOrCreate').mockResolvedValue({ items: [] } as never);
    return { service, prisma, addItem };
  }

  it('moves every unit of the line onto the new design, then drops the old line', async () => {
    const { service, prisma, addItem } = setup('new-hash');

    await service.replaceItemDesign('tok', 'line-1', DESIGN);

    expect(addItem).toHaveBeenCalledWith('tok', 'var-1', 2, ['red'], undefined, undefined, DESIGN, { track: false });
    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'line-1' } });
  });

  it('does nothing when the design did not change — re-adding it would merge into, then delete, itself', async () => {
    const { service, prisma, addItem } = setup('old-hash');

    await service.replaceItemDesign('tok', 'line-1', DESIGN);

    expect(addItem).not.toHaveBeenCalled();
    expect(prisma.cartItem.delete).not.toHaveBeenCalled();
  });

  it('removing the embroidery puts the units back as the plain item', async () => {
    const { service, prisma, addItem } = setup('unused');

    await service.removeItemDesign('tok', 'line-1');

    expect(addItem).toHaveBeenCalledWith('tok', 'var-1', 2, ['red'], undefined, undefined, undefined, { track: false });
    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'line-1' } });
  });
});
