import { PersonalizationService } from './personalization.service';
import { PERSONALIZATION_ERRORS as E } from './personalization.constants';

/**
 * These cover the two things that must never drift silently: what the shop is
 * willing to stitch, and what it charges for it. Both are decided entirely by
 * `resolve`, which is the only path into a cart — a bug here either sells
 * machine time below cost or sends a design to the floor that cannot be sewn.
 */

const FRONT = {
  id: 'pl-front',
  key: 'front',
  // A position with no photo is not offered and must not be buyable either.
  mediaKey: 'media/front.jpg',
  // Localized maps, as an admin writes them — English plus whatever the
  // Generate button produced.
  label: { en: 'Front panel', fr: 'Panneau avant' },
  hint: { en: 'Above the peak' },
  fieldWidthMm: 110,
  fieldHeightMm: 55,
  maxColors: 3,
  maxChars: 14,
  priceCents: 0,
  isActive: true,
  allowPuff: true,
};
const BACK = {
  ...FRONT,
  id: 'pl-back',
  key: 'back',
  label: { en: 'Back strap', fr: 'Bande arrière' },
  fieldWidthMm: 80,
  fieldHeightMm: 25,
  maxColors: 2,
  maxChars: 12,
  priceCents: 150,
};

const BLOCK = {
  key: 'block-classic',
  name: 'Block',
  webFamily: 'sans-serif',
  minHeightMm: 8,
  maxHeightMm: 40,
  stitchesPerCharAt10mm: 130,
  avgCharWidthRatio: 0.62,
  uppercaseOnly: false,
  supportsMonogram: true,
  supportsPuff: true,
  supportsCurve: true,
  isActive: true,
};
const VARSITY = { ...BLOCK, key: 'serif-varsity', name: 'Varsity', uppercaseOnly: true, stitchesPerCharAt10mm: 200, avgCharWidthRatio: 0.74 };
const SIGNATURE = { ...BLOCK, key: 'script-signature', name: 'Signature', supportsMonogram: false, minHeightMm: 12 };

const TEAL = { id: 't-1', brand: 'Madeira Polyneon', code: '1791', name: 'Teal', hex: '#0d8f8c', isActive: true, finish: 'matte', priceMultiplier: 1 };
const PINK = { id: 't-2', brand: 'Madeira Polyneon', code: '1921', name: 'Fuchsia', hex: '#c8186a', isActive: true, finish: 'matte', priceMultiplier: 1 };
const WHITE = { id: 't-3', brand: 'Madeira Polyneon', code: '1000', name: 'White', hex: '#ffffff', isActive: true, finish: 'matte', priceMultiplier: 1 };

const BANDS = [
  { maxStitches: 3000, priceCents: 800, label: 'Small' },
  { maxStitches: 6000, priceCents: 1200, label: 'Medium' },
  { maxStitches: 9000, priceCents: 1800, label: 'Large' },
];

/** A send-in side: the customer's photo stands in for the position's own. */
const SIDE = { ...BACK, key: 'side-1', mediaKey: null, usesCustomerPhoto: true, priceCents: 0, allowPuff: true };

const PLACEMENTS = [FRONT, BACK, SIDE];
const FONTS = [BLOCK, VARSITY, SIGNATURE];
const THREADS = [TEAL, PINK, WHITE];

function makeService(
  overrides: { productActive?: boolean; hasTemplate?: boolean; allowMonogram?: boolean; hasView?: boolean } = {},
) {
  const { productActive = true, hasTemplate = true, allowMonogram = true } = overrides;
  const prisma = {
    product: {
      findUnique: jest.fn(async () => ({
        id: 'p1',
        status: productActive ? 'active' : 'draft',
        personalizationTemplateId: hasTemplate ? 'tpl-1' : null,
      })),
    },
    personalizationTemplate: {
      // Shop-wide policy only: what may be written, and the stitch bands.
      findUnique: jest.fn(async () => ({
        id: 'tpl-1',
        key: 'cap-standard',
        name: 'Cap',
        isActive: true,
        allowText: true,
        allowMonogram,
        allowUpload: false,
        priceBands: BANDS,
      })),
    },
    // Positions belong to the product, and are looked up one at a time by key.
    embroideryMotif: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        where.key === 'heart'
          ? { key: 'heart', name: { en: 'Heart' }, path: 'M0 0 L10 10', viewBox: '0 0 100 100', stitchesAt30mm: 2200, colorCount: 1, isActive: true }
          : null,
      ),
    },
    personalizationPlacement: {
      findUnique: jest.fn(async ({ where }: { where: { productId_key: { key: string } } }) => {
        const found = PLACEMENTS.find((p) => p.key === where.productId_key.key);
        if (!found) return null;
        return overrides.hasView === false ? { ...found, mediaKey: null } : found;
      }),
      findMany: jest.fn(async () => PLACEMENTS),
    },
    embroideryFont: { findUnique: jest.fn(async ({ where }: { where: { key: string } }) => FONTS.find((f) => f.key === where.key) ?? null) },
    threadColor: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        THREADS.filter((t) => where.id.in.includes(t.id)),
      ),
    },
    sendInItemType: { findUnique: jest.fn(async () => ({ isActive: true, priceCents: 990 })) },
    sendInArtwork: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        where.key === 'send-in/artwork/a.png'
          ? { key: 'send-in/artwork/a.png', originalKey: 'send-in/artwork/a-original.svg', originalName: 'crest.svg', widthPx: 1000, heightPx: 500, coverage: 0.4 }
          : null,
      ),
    },
    // (the position's own photo is on the placement fixture below)
  };
  // The asset resolver is only reached by getConfigForProduct, which these
  // specs do not exercise — resolve() never touches it.
  const assetUrls = { resolveBatch: jest.fn(async () => new Map<string, string>()) };
  return new PersonalizationService(prisma as never, assetUrls as never);
}

/**
 * Builds a one-box design from a flat override, so a spec reads as "Maria at
 * 20mm in teal" rather than as a nested document. Design-level keys go on the
 * position; everything else goes on the box. `threadColorIds` keeps its old
 * spelling — the first id is the box's spool.
 */
const DESIGN_KEYS = new Set(['placementKey', 'elements', 'customerItem']);
const design = (over: Partial<Record<string, unknown>> = {}) => {
  const { threadColorIds, ...rest } = over as { threadColorIds?: string[] } & Record<string, unknown>;
  const position: Record<string, unknown> = { placementKey: 'front' };
  const box: Record<string, unknown> = {
    contentType: 'text',
    text: 'Maria',
    fontKey: 'block-classic',
    heightMm: 20,
    threadColorId: threadColorIds?.[0] ?? TEAL.id,
  };
  for (const [k, v] of Object.entries(rest)) (DESIGN_KEYS.has(k) ? position : box)[k] = v;
  return { ...position, elements: position.elements ?? [box] } as never;
};

/** A second box, in whichever spool the test names. */
const box = (over: Record<string, unknown> = {}) => ({
  contentType: 'text',
  text: 'Jo',
  fontKey: 'block-classic',
  heightMm: 10,
  threadColorId: PINK.id,
  offsetYMm: 18,
  ...over,
});

/** Reads the `code` off the coded BadRequest the service throws. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return ((err as { response?: { code?: string } }).response?.code ?? 'UNKNOWN') as string;
  }
}

describe('PersonalizationService.resolve — normalisation', () => {
  it('trims and collapses whitespace, so padding never becomes a different design', async () => {
    // 14mm rather than the default 20: two words at 20mm are 118mm wide and
    // would be rejected for the field before normalisation could be checked.
    const r = await makeService().resolve('p1', design({ text: '  Maria   Rose ', heightMm: 14 }));
    expect(r.text).toBe('Maria Rose');
  });

  it('upper-cases for a capitals-only face rather than promising letters it cannot sew', async () => {
    const r = await makeService().resolve('p1', design({ fontKey: 'serif-varsity', text: 'leo' }));
    expect(r.text).toBe('LEO');
  });

  it('strips spaces and upper-cases a monogram', async () => {
    const r = await makeService().resolve('p1', design({ contentType: 'monogram', text: 'm j b' }));
    expect(r.text).toBe('MJB');
  });

  it('normalises a decomposed accent to one code point, so it fits the character limit', async () => {
    // "Chloé" typed as e + combining acute is 6 code points, not 5.
    const r = await makeService().resolve('p1', design({ text: 'Chloé' }));
    expect(r.text).toBe('Chloé');
    expect(r.text.length).toBe(5);
  });
});

describe('PersonalizationService.resolve — what will not be stitched', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['empty after trimming', { text: '   ' }, E.TEXT_EMPTY],
    ['emoji', { text: 'Maria 🎀' }, E.TEXT_UNSTITCHABLE],
    ['a script no face covers', { text: 'Мария' }, E.TEXT_UNSTITCHABLE],
    ['profanity', { text: 'fuck off' }, E.TEXT_BLOCKED],
    ['longer than the placement allows', { placementKey: 'back', text: 'Alexandria Rose' }, E.TEXT_TOO_LONG],
    ['wider than the machine can hoop', { text: 'Alexandra Rose', heightMm: 40 }, E.TOO_WIDE],
    ['below the face’s minimum height', { fontKey: 'script-signature', heightMm: 9 }, E.HEIGHT_OUT_OF_RANGE],
    ['above the face’s maximum height', { heightMm: 45 }, E.HEIGHT_OUT_OF_RANGE],
    [
      'more colours across the boxes than the position takes',
      { placementKey: 'back', text: 'Jo', heightMm: 10, elements: [box({ threadColorId: TEAL.id, offsetYMm: -8 }), box({ threadColorId: PINK.id, offsetYMm: 0 }), box({ threadColorId: WHITE.id, offsetYMm: 8 })] },
      E.TOO_MANY_COLORS,
    ],
    ['a monogram of four letters', { contentType: 'monogram', text: 'ABCD' }, E.MONOGRAM_LENGTH],
    ['a monogram on a face that cannot interlock', { contentType: 'monogram', text: 'AB', fontKey: 'script-signature' }, E.FONT_UNKNOWN],
    ['a placement that does not exist', { placementKey: 'peak' }, E.PLACEMENT_UNKNOWN],
    ['a thread that is not on the wall', { threadColorIds: ['t-nope'] }, E.THREAD_UNKNOWN],
  ];

  it.each(cases)('rejects %s', async (_label, over, expected) => {
    expect(await codeOf(makeService().resolve('p1', design(over)))).toBe(expected);
  });

  it('accepts the accents our locales actually use', async () => {
    const s = makeService();
    await expect(s.resolve('p1', design({ text: 'Chloé' }))).resolves.toBeDefined();
    await expect(s.resolve('p1', design({ text: 'Łukasz', heightMm: 12 }))).resolves.toBeDefined();
  });

  it('rejects a design past the largest price band rather than inventing a price', async () => {
    // Narrow enough to clear the width check, dense enough to exceed 9000:
    // three Varsity letters at 40mm, heaviest weight, in 3D puff (~8,500), next
    // to a second box of ~700 — one hoop, one budget, over together.
    expect(await codeOf(makeService().resolve('p1', design({ elements: [box({ fontKey: 'serif-varsity', text: 'ABC', heightMm: 40, weight: 5, puff: true, threadColorId: TEAL.id, offsetYMm: 0 }), box({ text: 'Jo', heightMm: 18, threadColorId: TEAL.id, offsetYMm: 24 })] })))).toBe(
      E.TOO_MANY_STITCHES,
    );
  });

  it('refuses a product with no template, and one that is not active', async () => {
    expect(await codeOf(makeService({ hasTemplate: false }).resolve('p1', design()))).toBe(E.NOT_AVAILABLE);
    expect(await codeOf(makeService({ productActive: false }).resolve('p1', design()))).toBe(E.NOT_AVAILABLE);
  });

  it('refuses a position that has no photograph yet', async () => {
    // Added but never finished — the editor never shows it, and a crafted
    // request must not get past this either.
    expect(await codeOf(makeService({ hasView: false }).resolve('p1', design()))).toBe(E.PLACEMENT_UNKNOWN);
  });

  it('refuses a content type the template does not offer', async () => {
    expect(await codeOf(makeService({ allowMonogram: false }).resolve('p1', design({ contentType: 'monogram', text: 'AB' })))).toBe(
      E.CONTENT_TYPE_DISABLED,
    );
  });
});

describe('PersonalizationService.resolve — the hoop', () => {
  it('is fitted round the box, with clearance, and frozen on the design', async () => {
    const r = await makeService().resolve('p1', design());
    // "Maria" at 20mm is 62mm wide: 4mm of clearance each side.
    expect(r.fieldWidthMm).toBe(70);
    expect(r.fieldHeightMm).toBe(28);
    expect((r.designJson as { field: unknown }).field).toEqual({ widthMm: 70, heightMm: 28 });
  });

  it('never shrinks below what a frame can hold', async () => {
    const r = await makeService().resolve('p1', design({ text: 'I', heightMm: 8 }));
    expect(r.fieldWidthMm).toBeGreaterThanOrEqual(15);
    expect(r.fieldHeightMm).toBeGreaterThanOrEqual(15);
  });

  it('is part of the design\'s identity — the same words further apart hash apart', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design({ elements: [box({ text: 'Maria', heightMm: 20, threadColorId: TEAL.id, offsetYMm: -10 }), box({ offsetYMm: 10 })] }));
    const b = await s.resolve('p1', design({ elements: [box({ text: 'Maria', heightMm: 20, threadColorId: TEAL.id, offsetYMm: -20 }), box({ offsetYMm: 20 })] }));
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('PersonalizationService.resolve — stitches and price', () => {
  it('scales stitches faster than the height but well short of its square', async () => {
    const s = makeService();
    const small = await s.resolve('p1', design({ heightMm: 10 }));
    const big = await s.resolve('p1', design({ heightMm: 20 }));

    // 5 glyphs × 130 × 1 + 80 overhead = 730; at 20mm the factor is 2^1.3 ≈ 2.46.
    expect(small.stitchEstimate).toBe(730);
    expect(big.stitchEstimate).toBe(1681);
  });

  it('charges a colour change per extra spool across the boxes, but not for the same spool twice', async () => {
    const s = makeService();
    const one = await s.resolve('p1', design());
    const extra = await s.resolve('p1', design({ elements: [box({ text: 'Maria', heightMm: 20, threadColorId: TEAL.id, offsetYMm: -8 }), box({ threadColorId: TEAL.id })] }));
    const two = await s.resolve('p1', design({ elements: [box({ text: 'Maria', heightMm: 20, threadColorId: TEAL.id, offsetYMm: -8 }), box({ threadColorId: PINK.id })] }));

    // "Jo" at 10mm is 2 × 130 + 80 = 340 stitches of its own.
    expect(extra.stitchEstimate).toBe(one.stitchEstimate + 340);
    expect(two.stitchEstimate).toBe(extra.stitchEstimate + 120);
    expect(extra.threadColors).toHaveLength(1);
    expect(two.threadColors).toHaveLength(2);
  });

  it('picks the first band the estimate fits in', async () => {
    const s = makeService();
    // 730, 1681, 4744 and 6377 stitches — one in each band. Height alone no
    // longer reaches the top band on a 110mm field (a longer name would be too
    // wide), so the last two lean on weight and 3D puff, which is also how a
    // real customer gets there.
    expect((await s.resolve('p1', design({ heightMm: 10 }))).priceCents).toBe(800);
    expect((await s.resolve('p1', design({ heightMm: 20 }))).priceCents).toBe(800);
    expect((await s.resolve('p1', design({ heightMm: 30, weight: 5 }))).priceCents).toBe(1200);
    expect(
      (await s.resolve('p1', design({ heightMm: 30, weight: 5, puff: true }))).priceCents,
    ).toBe(1800);
  });

  it('adds the position’s own price on top of the band', async () => {
    const s = makeService();
    const front = await s.resolve('p1', design({ heightMm: 10 }));
    const back = await s.resolve('p1', design({ placementKey: 'back', heightMm: 10 }));

    expect(back.priceCents).toBe(front.priceCents + 150);
  });

  it('charges a send-in side its flat fee whatever is drawn on it', async () => {
    const s = makeService();
    const customerItem = {
      itemType: 'cap',
      photoKeys: ['send-in/a.jpg'],
      corners: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }],
    };
    const small = await s.resolve('p1', design({ placementKey: 'side-1', heightMm: 10, customerItem }));
    const heavy = await s.resolve('p1', design({ placementKey: 'side-1', heightMm: 30, weight: 5, puff: true, customerItem }));

    // Small and Large bands on a catalogue cap — one price on the customer's own.
    expect(small.priceCents).toBe(990);
    expect(heavy.priceCents).toBe(990);
    expect(heavy.stitchEstimate).toBeGreaterThan(small.stitchEstimate);
  });

  it('takes the customer’s own artwork on their item, sized by width and shaped by the file', async () => {
    const s = makeService();
    const customerItem = { itemType: 'cap', photoKeys: ['send-in/a.jpg'], corners: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }] };
    const r = await s.resolve('p1', design({ placementKey: 'side-1', contentType: 'artwork', text: '', artworkKey: 'send-in/artwork/a.png', artworkSizeMm: 80, customerItem }));
    const [el] = r.elements;

    expect(el.artwork).toMatchObject({ name: 'crest.svg', widthMm: 80, heightMm: 40 });
    expect(el.thread).toBeNull();
    // 80 × 40 mm at 40% drawn, 6 stitches per mm² — plus the overhead.
    expect(el.stitchEstimate).toBeGreaterThan(80 * 40 * 0.4 * 6);
    expect(r.priceCents).toBe(990);
    expect((r.designJson as { elements: { artwork: { originalKey: string } }[] }).elements[0].artwork.originalKey).toBe('send-in/artwork/a-original.svg');
  });

  it('refuses artwork that was never uploaded, and artwork on a catalogue cap', async () => {
    const s = makeService();
    const customerItem = { itemType: 'cap', photoKeys: ['send-in/a.jpg'], corners: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }] };
    expect(await codeOf(s.resolve('p1', design({ placementKey: 'side-1', contentType: 'artwork', text: '', artworkKey: 'send-in/artwork/nope.png', customerItem })))).toBe(
      'PERSONALIZATION_ARTWORK_UNKNOWN',
    );
    expect(await codeOf(s.resolve('p1', design({ contentType: 'artwork', text: '', artworkKey: 'send-in/artwork/a.png' })))).toBe('PERSONALIZATION_CONTENT_TYPE_DISABLED');
  });

  it('counts a monogram denser than the same letters set as text', async () => {
    const s = makeService();
    const asText = await s.resolve('p1', design({ text: 'MJB', heightMm: 15 }));
    const asMonogram = await s.resolve('p1', design({ contentType: 'monogram', text: 'MJB', heightMm: 15 }));

    expect(asMonogram.stitchEstimate).toBeGreaterThan(asText.stitchEstimate);
  });
});

describe('PersonalizationService.resolve — where the design sits in the field', () => {
  it('centres a design nobody moved', async () => {
    const r = await makeService().resolve('p1', design());
    expect([r.offsetXMm, r.offsetYMm]).toEqual([0, 0]);
  });

  it('keeps an offset that stays inside the field', async () => {
    const r = await makeService().resolve('p1', design({ offsetXMm: 10, offsetYMm: -5 }));
    expect([r.offsetXMm, r.offsetYMm]).toEqual([10, -5]);
  });

  it('clamps rather than rejects, even for a field wide enough to out-travel the schema rail', async () => {
    // Regression guard: the DTO used to cap the offset at ±200mm, which a
    // 200mm-wide position out-travels (200 × 1.5 = 300). A legitimate drag then
    // came back as a 400 instead of stopping at the edge. The schema's rail
    // must stay well clear of any field a shop might configure.
    const r = await makeService().resolve('p1', design({ offsetXMm: 400 }));
    expect(r.offsetXMm).toBe(165);
  });

  it('clamps a drag that ran past the limit instead of rejecting it', async () => {
    // The hoop field travels with the lettering, so the bound is
    // MAX_TRAVEL_FACTOR (1.5) × the field, not the room left inside it:
    // 110 × 1.5 = 165 sideways, 55 × 1.5 = 82.5 vertically.
    const r = await makeService().resolve('p1', design({ offsetXMm: 999, offsetYMm: 999 }));
    expect([r.offsetXMm, r.offsetYMm]).toEqual([165, 82.5]);

    const back = await makeService().resolve('p1', design({ offsetXMm: -999, offsetYMm: -999 }));
    expect([back.offsetXMm, back.offsetYMm]).toEqual([-165, -82.5]);
  });

  it('lets the design travel well outside its own field — the hoop moves too', async () => {
    // The old rule kept the lettering inside the traced box. It no longer does,
    // which is the whole point: the customer places the embroidery on the item,
    // not within a rectangle somebody else drew.
    const r = await makeService().resolve('p1', design({ offsetXMm: 90 }));
    expect(r.offsetXMm).toBe(90);
  });

  it('gives a smaller position less travel', async () => {
    const front = await makeService().resolve('p1', design({ offsetXMm: 999 }));
    const back = await makeService().resolve('p1', design({ placementKey: 'back', text: 'Jo', heightMm: 10, offsetXMm: 999 }));
    expect(back.offsetXMm).toBeLessThan(front.offsetXMm);
  });

  it('rounds the clamped value, so no operator sheet reads 27.499999999999996mm', async () => {
    const r = await makeService().resolve('p1', design({ offsetXMm: 999, offsetYMm: 10.37 }));
    expect(Number.isInteger(r.offsetXMm * 10)).toBe(true);
    expect(r.offsetYMm).toBe(10.4);
  });

  it('shows both the traced position and where this job is actually hooped', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ offsetXMm: 12, offsetYMm: -4 }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    // The page holds the hoop where it was fitted — round the box, 12mm to
    // the right of the traced centre — and says so.
    expect(svg).toContain('hooped 12mm, -4mm from the traced centre');
    // Two rectangles: the faint reference and the solid one being sewn.
    expect((svg.match(/<rect /g) ?? []).length).toBe(2);
  });

  it('says so explicitly when a design sits on the traced position', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design());
    expect(s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 })).toContain('centred on the traced position');
  });
});

describe('PersonalizationService.resolve — weight', () => {
  it('defaults to regular when nobody chose', async () => {
    const r = await makeService().resolve('p1', design());
    expect([r.weightStep, r.fontWeight]).toEqual([2, 400]);
  });

  it('costs more stitches the heavier it is, because it is more thread', async () => {
    const s = makeService();
    const light = await s.resolve('p1', design({ weight: 1 }));
    const regular = await s.resolve('p1', design({ weight: 2 }));
    const bold = await s.resolve('p1', design({ weight: 5 }));

    expect(light.stitchEstimate).toBeLessThan(regular.stitchEstimate);
    expect(bold.stitchEstimate).toBeGreaterThan(regular.stitchEstimate);
    expect(bold.fontWeight).toBe(900);
  });

  it('can push a design into a higher price band', async () => {
    const s = makeService();
    // 2792 stitches regular, ~4745 at the heaviest — across the 3000 boundary.
    expect((await s.resolve('p1', design({ heightMm: 30, weight: 2 }))).priceCents).toBe(800);
    expect((await s.resolve('p1', design({ heightMm: 30, weight: 5 }))).priceCents).toBe(1200);
  });

  it('widens the line only slightly — a satin column grows mostly inward', async () => {
    const s = makeService();
    const regular = await s.resolve('p1', design({ heightMm: 10 }));
    const bold = await s.resolve('p1', design({ heightMm: 10, weight: 5 }));

    expect(bold.widthMm).toBeGreaterThan(regular.widthMm);
    expect(bold.widthMm).toBeLessThan(regular.widthMm * 1.15);
  });

  it('is part of the design, so two weights are two cart lines', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design({ weight: 2 }));
    const b = await s.resolve('p1', design({ weight: 4 }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('puts the weight on the production sheet when it is not regular', async () => {
    const s = makeService();
    const bold = await s.resolve('p1', design({ weight: 4 }));
    const svg = s.buildProductionSvg(bold, { fieldWidthMm: 110, fieldHeightMm: 55 });
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('weight 700');
  });
});

describe('PersonalizationService.resolve — rotation', () => {
  /** The angle lives on the box: the area itself is never turned. */
  const angleOf = async (over: Record<string, unknown> = {}) => {
    const r = await makeService().resolve('p1', design(over));
    return r.elements[0].rotationDeg;
  };

  it('is square to the traced position by default', async () => {
    const r = await makeService().resolve('p1', design());
    expect(r.elements[0].rotationDeg).toBe(0);
    expect(r.rotationDeg).toBe(0);
  });

  it('keeps any angle — a machine sews a path at whatever angle the file says', async () => {
    expect(await angleOf({ rotationDeg: 12.5 })).toBe(12.5);
    expect(await angleOf({ rotationDeg: -90 })).toBe(-90);
  });

  it('accepts an angle past a full turn — a handle dragged twice round accumulates', async () => {
    // Regression guard: the DTO capped this at ±360, so spinning the handle
    // round twice came back as a 400 instead of folding. The schema's rail must
    // stay clear of any gesture a customer can actually make.
    expect(await angleOf({ rotationDeg: 1085 })).toBe(5);
  });

  it('folds a full turn away, so 370° and 10° are one design and not two cart lines', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design({ rotationDeg: 10 }));
    const b = await s.resolve('p1', design({ rotationDeg: 370 }));
    expect(b.elements[0].rotationDeg).toBe(10);
    expect(b.hash).toBe(a.hash);
  });

  it('normalises past half a turn to the short way round', async () => {
    expect(await angleOf({ rotationDeg: 270 })).toBe(-90);
  });

  it('is part of the design, so two angles are two cart lines', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design());
    const b = await s.resolve('p1', design({ rotationDeg: 15 }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('turns the box on the production sheet, and says so', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ rotationDeg: 20 }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    // One transform on the box: its lettering and its place can never disagree.
    expect(svg).toContain('rotate(20)');
    expect(svg).toContain('turned 20°');
  });

  it('grows the sheet when a turned box reaches past the area', async () => {
    const s = makeService();
    // A 62mm-wide box at the area's right edge, turned 45°, sticks out past it.
    const inside = await s.resolve('p1', design({ offsetXMm: 0 }));
    const turned = await s.resolve('p1', design({ elements: [box({ text: 'Maria', heightMm: 20, threadColorId: TEAL.id, offsetXMm: 50, offsetYMm: 0, rotationDeg: 45 })] }));

    const pageOf = (svg: string) => Number(svg.match(/width="([\d.]+)mm"/)![1]);
    expect(pageOf(s.buildProductionSvg(turned, { fieldWidthMm: 110, fieldHeightMm: 55 }))).toBeGreaterThan(
      pageOf(s.buildProductionSvg(inside, { fieldWidthMm: 110, fieldHeightMm: 55 })),
    );
  });
});

describe('PersonalizationService.resolve — design fingerprint', () => {
  it('matches two designs that differ only in how they were typed', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design({ text: 'Maria' }));
    const b = await s.resolve('p1', design({ text: '  Maria  ', heightMm: 20.0, threadColorIds: [TEAL.id, TEAL.id] }));

    // Same cart line, or a customer adding the same cap twice gets two lines.
    expect(b.hash).toBe(a.hash);
  });

  it('separates designs that would be stitched differently', async () => {
    const s = makeService();
    const base = await s.resolve('p1', design());

    for (const over of [{ text: 'Leo' }, { heightMm: 18 }, { threadColorIds: [PINK.id] }, { placementKey: 'back' }, { offsetXMm: 8 }, { offsetYMm: -6 }]) {
      expect((await s.resolve('p1', design(over))).hash).not.toBe(base.hash);
    }
  });

  it('treats a case difference as a different design on a mixed-case face', async () => {
    const s = makeService();
    const upper = await s.resolve('p1', design({ text: 'MARIA' }));
    const mixed = await s.resolve('p1', design({ text: 'Maria' }));
    expect(upper.hash).not.toBe(mixed.hash);
  });

  it('collapses a case difference on a capitals-only face, where it makes none', async () => {
    const s = makeService();
    const lower = await s.resolve('p1', design({ fontKey: 'serif-varsity', text: 'leo' }));
    const upper = await s.resolve('p1', design({ fontKey: 'serif-varsity', text: 'LEO' }));
    expect(lower.hash).toBe(upper.hash);
  });
});

describe('PersonalizationService — localized position names', () => {
  it('uses the customer’s language when the admin has written it', async () => {
    const r = await makeService().resolve('p1', design(), 'fr');
    expect(r.placementLabel).toBe('Panneau avant');
  });

  it('falls back to English for a language nobody has written', async () => {
    const r = await makeService().resolve('p1', design(), 'pl');
    expect(r.placementLabel).toBe('Front panel');
  });

  it('freezes the label onto the design, so a later rename never rewrites an order', async () => {
    const r = await makeService().resolve('p1', design(), 'fr');
    expect((r.designJson as { placementLabel: string }).placementLabel).toBe('Panneau avant');
  });
});

describe('PersonalizationService.resolveSet — several positions on one item', () => {
  const front = design({ placementKey: 'front', text: 'Maria', heightMm: 10 }) as Record<string, unknown>;
  const back = design({ placementKey: 'back', text: 'Leo', heightMm: 10 }) as Record<string, unknown>;

  it('totals every position, because each one is its own hooping and run', async () => {
    const s = makeService();
    const one = await s.resolveSet('p1', [front] as never);
    const both = await s.resolveSet('p1', [front, back] as never);

    // Front is band 800 + position 0; back is band 800 + position 150.
    expect(one.totalCents).toBe(800);
    expect(both.totalCents).toBe(1750);
    expect(both.designs).toHaveLength(2);
  });

  it('hashes the set in a stable order, so the order they were picked in does not matter', async () => {
    const s = makeService();
    const a = await s.resolveSet('p1', [front, back] as never);
    const b = await s.resolveSet('p1', [back, front] as never);
    expect(a.hash).toBe(b.hash);
  });

  it('separates one position from two, so they are different cart lines', async () => {
    const s = makeService();
    const one = await s.resolveSet('p1', [front] as never);
    const both = await s.resolveSet('p1', [front, back] as never);
    expect(one.hash).not.toBe(both.hash);
  });

  it('reports the first broken position rather than racing two failures', async () => {
    const s = makeService();
    const bad = design({ placementKey: 'back', text: 'fuck', heightMm: 10 });
    expect(await codeOf(s.resolveSet('p1', [front, bad] as never))).toBe(E.TEXT_BLOCKED);
  });
});

describe('PersonalizationService.buildProductionSvg', () => {
  it('sizes the artwork in real millimetres so it prints at stitch size', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ placementKey: 'back', text: 'Leo', heightMm: 12 }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 80, fieldHeightMm: 25 });

    // The page is the field plus a 4mm margin all round, so a job hooped away
    // from the traced centre is never cropped off the sheet. What has to be
    // true to scale is the field rectangle itself, and its user units are
    // millimetres — 80 × 25 inside an 88 × 33 page.
    expect(svg).toContain('width="88mm"');
    expect(svg).toContain('height="33mm"');
    expect(svg).toContain('viewBox="0 0 88 33"');
    expect(svg).toContain('width="80" height="25"');
  });

  it('records the thread and stitch count for the operator', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design());
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    expect(svg).toContain('Madeira Polyneon 1791 Teal');
    expect(svg).toContain(`~${r.stitchEstimate} stitches`);
  });

  it('escapes the customer’s text — it is the one part a stranger wrote', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ text: "Tom & Amy" }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    expect(svg).toContain('Tom &amp; Amy');
    expect(svg).not.toContain('Tom & Amy');
  });
});
