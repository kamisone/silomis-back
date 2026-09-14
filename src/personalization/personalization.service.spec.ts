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

const PLACEMENTS = [FRONT, BACK];
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
    // (the position's own photo is on the placement fixture below)
  };
  // The asset resolver is only reached by getConfigForProduct, which these
  // specs do not exercise — resolve() never touches it.
  const assetUrls = { resolveBatch: jest.fn(async () => new Map<string, string>()) };
  return new PersonalizationService(prisma as never, assetUrls as never);
}

const design = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    placementKey: 'front',
    contentType: 'text',
    text: 'Maria',
    fontKey: 'block-classic',
    heightMm: 20,
    threadColorIds: [TEAL.id],
    ...over,
  }) as never;

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
    ['wider than the hoop field', { placementKey: 'back', text: 'Alexandra', heightMm: 20 }, E.TOO_WIDE],
    ['below the face’s minimum height', { fontKey: 'script-signature', heightMm: 9 }, E.HEIGHT_OUT_OF_RANGE],
    ['above the placement’s field height', { placementKey: 'back', heightMm: 30 }, E.HEIGHT_OUT_OF_RANGE],
    ['more colours than the position takes', { placementKey: 'back', threadColorIds: [TEAL.id, PINK.id, WHITE.id] }, E.TOO_MANY_COLORS],
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
    // three Varsity letters at 40mm, heaviest weight, with an outline (~9,900).
    expect(await codeOf(makeService().resolve('p1', design({ fontKey: 'serif-varsity', text: 'ABC', heightMm: 40, weight: 5, outline: true, threadColorIds: [TEAL.id, PINK.id] })))).toBe(
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

describe('PersonalizationService.resolve — the customer-sized area', () => {
  it('uses the position\'s field as the starting size when none is sent', async () => {
    const r = await makeService().resolve('p1', design());
    expect([r.fieldWidthMm, r.fieldHeightMm]).toEqual([110, 55]);
  });

  it('lets a name through that the default area would refuse, once the area is widened', async () => {
    // "Alexandra" at 30mm is ~170mm wide — over the front's 110mm.
    expect(await codeOf(makeService().resolve('p1', design({ text: 'Alexandra', heightMm: 30 })))).toBe(E.TOO_WIDE);
    const r = await makeService().resolve('p1', design({ text: 'Alexandra', heightMm: 30, fieldWidthMm: 200, fieldHeightMm: 60 }));
    expect([r.fieldWidthMm, r.fieldHeightMm]).toEqual([200, 60]);
    expect(r.widthMm).toBeLessThanOrEqual(200);
  });

  it('refuses a design the customer shrank the area around', async () => {
    expect(await codeOf(makeService().resolve('p1', design({ heightMm: 20, fieldWidthMm: 30, fieldHeightMm: 40 })))).toBe(E.TOO_WIDE);
    // Two 10mm lines stack to ~23mm; the area is 20mm tall.
    expect(await codeOf(makeService().resolve('p1', design({ text: 'Max\nMo', heightMm: 10, fieldWidthMm: 60, fieldHeightMm: 20 })))).toBe(E.TOO_TALL);
  });

  it('clamps the area to the machine rather than rejecting it', async () => {
    const r = await makeService().resolve('p1', design({ text: 'Mo', heightMm: 10, fieldWidthMm: 5000, fieldHeightMm: 2 }));
    expect([r.fieldWidthMm, r.fieldHeightMm]).toEqual([300, 15]);
  });

  it('is part of the design\'s identity — the same words in a bigger hoop hash apart', async () => {
    const a = await makeService().resolve('p1', design());
    const b = await makeService().resolve('p1', design({ fieldWidthMm: 120 }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('still lets a small area travel as far as the position allows', async () => {
    const r = await makeService().resolve('p1', design({ fieldWidthMm: 30, fieldHeightMm: 20, text: 'Mo', heightMm: 10, offsetXMm: 150 }));
    expect(r.offsetXMm).toBe(150);
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

  it('charges a colour change per extra spool, but not for the same spool twice', async () => {
    const s = makeService();
    const one = await s.resolve('p1', design({ threadColorIds: [TEAL.id] }));
    const twice = await s.resolve('p1', design({ threadColorIds: [TEAL.id, TEAL.id] }));
    const two = await s.resolve('p1', design({ threadColorIds: [TEAL.id, PINK.id] }));

    expect(twice.stitchEstimate).toBe(one.stitchEstimate);
    expect(two.stitchEstimate).toBe(one.stitchEstimate + 120);
    expect(twice.threadColors).toHaveLength(1);
  });

  it('picks the first band the estimate fits in', async () => {
    const s = makeService();
    // 730, 1681, 4744 and 7429 stitches — one in each band. Height alone no
    // longer reaches the top band on a 110mm field (a longer name would be too
    // wide), so the last two lean on weight and an outline, which is also how
    // a real customer gets there.
    expect((await s.resolve('p1', design({ heightMm: 10 }))).priceCents).toBe(800);
    expect((await s.resolve('p1', design({ heightMm: 20 }))).priceCents).toBe(800);
    expect((await s.resolve('p1', design({ heightMm: 30, weight: 5 }))).priceCents).toBe(1200);
    expect(
      (await s.resolve('p1', design({ heightMm: 30, weight: 5, outline: true, threadColorIds: [TEAL.id, PINK.id] }))).priceCents,
    ).toBe(1800);
  });

  it('adds the position’s own price on top of the band', async () => {
    const s = makeService();
    const front = await s.resolve('p1', design({ heightMm: 10 }));
    const back = await s.resolve('p1', design({ placementKey: 'back', heightMm: 10 }));

    expect(back.priceCents).toBe(front.priceCents + 150);
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

    // The page is the union of both rectangles plus a 4mm margin, measured
    // rather than padded symmetrically: a 110-wide field offset 12mm right
    // spans -55..67, so 130mm holds it with nothing wasted.
    expect(svg).toContain('width="130mm"');
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
  it('is square to the traced position by default', async () => {
    expect((await makeService().resolve('p1', design())).rotationDeg).toBe(0);
  });

  it('keeps any angle — a machine sews a path at whatever angle the file says', async () => {
    const s = makeService();
    expect((await s.resolve('p1', design({ rotationDeg: 12.5 }))).rotationDeg).toBe(12.5);
    expect((await s.resolve('p1', design({ rotationDeg: -90 }))).rotationDeg).toBe(-90);
  });

  it('accepts an angle past a full turn — a handle dragged twice round accumulates', async () => {
    // Regression guard: the DTO capped this at ±360, so spinning the handle
    // round twice came back as a 400 instead of folding. The schema's rail must
    // stay clear of any gesture a customer can actually make.
    expect((await makeService().resolve('p1', design({ rotationDeg: 1085 }))).rotationDeg).toBe(5);
  });

  it('folds a full turn away, so 370° and 10° are one design and not two cart lines', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design({ rotationDeg: 10 }));
    const b = await s.resolve('p1', design({ rotationDeg: 370 }));
    expect(b.rotationDeg).toBe(10);
    expect(b.hash).toBe(a.hash);
  });

  it('normalises past half a turn to the short way round', async () => {
    expect((await makeService().resolve('p1', design({ rotationDeg: 270 }))).rotationDeg).toBe(-90);
  });

  it('is part of the design, so two angles are two cart lines', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design());
    const b = await s.resolve('p1', design({ rotationDeg: 15 }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('turns the frame and the lettering together on the production sheet', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ rotationDeg: 20 }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    // One transform on the group: the frame and the text can never disagree.
    expect(svg).toContain('rotate(20)');
    expect(svg).toContain('turned 20°');
  });

  it('grows the sheet to the turned rectangle’s real footprint', async () => {
    const s = makeService();
    const square = await s.resolve('p1', design());
    const turned = await s.resolve('p1', design({ rotationDeg: 45 }));

    const pageOf = (svg: string) => Number(svg.match(/width="([\d.]+)mm"/)![1]);
    // A 110×55 rectangle at 45° is about 117mm across — wider than either side,
    // so a page sized from the sides alone would crop it.
    expect(pageOf(s.buildProductionSvg(turned, { fieldWidthMm: 110, fieldHeightMm: 55 }))).toBeGreaterThan(
      pageOf(s.buildProductionSvg(square, { fieldWidthMm: 110, fieldHeightMm: 55 })),
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
  const front = { placementKey: 'front', contentType: 'text', text: 'Maria', fontKey: 'block-classic', heightMm: 10, threadColorIds: [TEAL.id] };
  const back = { placementKey: 'back', contentType: 'text', text: 'Leo', fontKey: 'block-classic', heightMm: 10, threadColorIds: [TEAL.id] };

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
    const bad = { ...back, text: 'fuck' };
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
