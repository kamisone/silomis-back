import { PersonalizationService } from './personalization.service';

/**
 * The cap in the editor must be the cap the customer chose: a position's photo
 * follows the variant's options, first-listed attribute first.
 */
function make(opts: {
  variantOptions: { optionValueId: string; attributeId: string }[];
  attributeOrder: { attributeId: string; sortOrder: number }[];
  images: { placementId: string; optionValueId: string; mediaKey: string }[];
}) {
  const prisma = {
    variantOption: { findMany: jest.fn().mockResolvedValue(opts.variantOptions) },
    productVariantAttribute: { findMany: jest.fn().mockResolvedValue(opts.attributeOrder) },
    personalizationPlacementOptionImage: { findMany: jest.fn().mockResolvedValue(opts.images) },
  };
  return new PersonalizationService(prisma as never, {} as never);
}

const placements = [
  { id: 'front', mediaKey: 'front-default.jpg' },
  { id: 'side', mediaKey: 'side-default.jpg' },
];
const BLACK = { optionValueId: 'black', attributeId: 'color' };
const SIZE_M = { optionValueId: 'm', attributeId: 'size' };
const order = [
  { attributeId: 'color', sortOrder: 0 },
  { attributeId: 'size', sortOrder: 1 },
];

describe('PersonalizationService.placementPhotoKeys', () => {
  it("shows the position's photo for the variant's colour, and the default where there is none", async () => {
    const svc = make({ variantOptions: [BLACK], attributeOrder: order, images: [{ placementId: 'front', optionValueId: 'black', mediaKey: 'front-black.jpg' }] });
    const keys = await svc.placementPhotoKeys('p1', placements, 'v-black');
    expect(keys.get('front')).toBe('front-black.jpg');
    expect(keys.get('side')).toBe('side-default.jpg');
  });

  it('prefers the attribute listed first on the product when two options have photos', async () => {
    const images = [
      { placementId: 'front', optionValueId: 'm', mediaKey: 'front-size-m.jpg' },
      { placementId: 'front', optionValueId: 'black', mediaKey: 'front-black.jpg' },
    ];
    const svc = make({ variantOptions: [SIZE_M, BLACK], attributeOrder: order, images });
    expect((await svc.placementPhotoKeys('p1', placements, 'v')).get('front')).toBe('front-black.jpg');

    const sizeFirst = make({ variantOptions: [SIZE_M, BLACK], attributeOrder: [{ attributeId: 'size', sortOrder: 0 }, { attributeId: 'color', sortOrder: 1 }], images });
    expect((await sizeFirst.placementPhotoKeys('p1', placements, 'v')).get('front')).toBe('front-size-m.jpg');
  });

  it('keeps every default photo without a variant', async () => {
    const svc = make({ variantOptions: [BLACK], attributeOrder: order, images: [{ placementId: 'front', optionValueId: 'black', mediaKey: 'front-black.jpg' }] });
    const keys = await svc.placementPhotoKeys('p1', placements, null);
    expect(keys.get('front')).toBe('front-default.jpg');
  });
});
