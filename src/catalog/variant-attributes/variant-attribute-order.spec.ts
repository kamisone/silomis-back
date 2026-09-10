import { VariantAttributesService } from './variant-attributes.service';

type Attr = { adminLabel: string | null; name: string };

/**
 * The admin list is scanned by internal label — that field exists precisely to
 * tell apart attributes sharing one storefront name, so it is what the order
 * has to follow.
 */
function makeService(attributes: Attr[]) {
  const prisma = { variantAttribute: { findMany: jest.fn(async () => attributes) } };
  return new VariantAttributesService(prisma as never);
}

async function order(attributes: Attr[]): Promise<string[]> {
  const rows = await makeService(attributes).findAll();
  // Mirrors the service's own fallback, so a blank label reads back as the name.
  return rows.map((a) => a.adminLabel?.trim() || a.name);
}

describe('VariantAttributesService.findAll ordering', () => {
  it('orders by the internal label, not by the storefront name', async () => {
    expect(
      await order([
        { adminLabel: 'Zip type', name: 'Attache' },
        { adminLabel: 'Colour (wood)', name: 'Couleur' },
        { adminLabel: 'Colour (fabric)', name: 'Couleur' },
      ]),
    ).toEqual(['Colour (fabric)', 'Colour (wood)', 'Zip type']);
  });

  it('falls back to the name, interleaved — an unlabelled attribute is not exiled to the bottom', async () => {
    expect(
      await order([
        { adminLabel: 'Colour (wood)', name: 'Couleur' },
        { adminLabel: null, name: 'Size' },
        { adminLabel: null, name: 'Age' },
      ]),
    ).toEqual(['Age', 'Colour (wood)', 'Size']);
  });

  it('treats a blank internal label as absent rather than sorting it first', async () => {
    expect(await order([{ adminLabel: '   ', name: 'Weight' }, { adminLabel: 'Material', name: 'Matière' }])).toEqual([
      'Material',
      'Weight',
    ]);
  });

  it('places an accented label where a reader expects it, not after Z', async () => {
    expect(
      await order([
        { adminLabel: 'Finish', name: 'Finition' },
        { adminLabel: 'Épaisseur', name: 'Epaisseur' },
        { adminLabel: 'Depth', name: 'Profondeur' },
      ]),
    ).toEqual(['Depth', 'Épaisseur', 'Finish']);
  });

  it('is case-insensitive, so capitalisation does not split the alphabet in two', async () => {
    expect(await order([{ adminLabel: 'zip', name: 'Zip' }, { adminLabel: 'Age', name: 'Age' }])).toEqual(['Age', 'zip']);
  });

  it('orders numbered labels the way a person counts them', async () => {
    expect(
      await order([
        { adminLabel: 'Tier 10', name: 'T10' },
        { adminLabel: 'Tier 2', name: 'T2' },
      ]),
    ).toEqual(['Tier 2', 'Tier 10']);
  });
});
