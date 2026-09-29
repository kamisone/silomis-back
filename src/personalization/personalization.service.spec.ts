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
  avgCharWidthRatio: 0.62,
  uppercaseOnly: false,
  supportsMonogram: true,
  supportsPuff: true,
  supportsCurve: true,
  isActive: true,
};
const VARSITY = { ...BLOCK, key: 'serif-varsity', name: 'Varsity', uppercaseOnly: true, avgCharWidthRatio: 0.74 };
const SIGNATURE = { ...BLOCK, key: 'script-signature', name: 'Signature', supportsMonogram: false };

const TEAL = { id: 't-1', brand: 'Madeira Polyneon', code: '1791', name: 'Teal', hex: '#0d8f8c', isActive: true, finish: 'matte', priceMultiplier: 1 };
const PINK = { id: 't-2', brand: 'Madeira Polyneon', code: '1921', name: 'Fuchsia', hex: '#c8186a', isActive: true, finish: 'matte', priceMultiplier: 1 };
const WHITE = { id: 't-3', brand: 'Madeira Polyneon', code: '1000', name: 'White', hex: '#ffffff', isActive: true, finish: 'matte', priceMultiplier: 1 };


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
      // Shop-wide policy only: what may be written, and the extra-box fee.
      findUnique: jest.fn(async () => ({
        id: 'tpl-1',
        key: 'cap-standard',
        name: 'Cap',
        isActive: true,
        allowText: true,
        allowMonogram,
        allowUpload: false,
      })),
    },
    // Positions belong to the product, and are looked up one at a time by key.
    embroideryMotif: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        where.key === 'heart'
          ? { key: 'heart', name: { en: 'Heart' }, path: 'M0 0 L10 10', viewBox: '0 0 100 100', colorCount: 1, isActive: true, priceCents: 0, ownColours: false, paths: null }
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
    platformSettings: { findUnique: jest.fn(async () => null) },
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
    ['profanity', { text: 'fuck off' }, E.TEXT_BLOCKED],
    ['wider than the machine can hoop', { text: 'Alexandra Rose', heightMm: 40 }, E.TOO_WIDE],
    ['a monogram of four letters', { contentType: 'monogram', text: 'ABCD' }, E.MONOGRAM_LENGTH],
    ['a monogram on a face that cannot interlock', { contentType: 'monogram', text: 'AB', fontKey: 'script-signature' }, E.FONT_UNKNOWN],
    ['a placement that does not exist', { placementKey: 'peak' }, E.PLACEMENT_UNKNOWN],
    ['a thread that is not on the wall', { threadColorIds: ['t-nope'] }, E.THREAD_UNKNOWN],
  ];

  it.each(cases)('rejects %s', async (_label, over, expected) => {
    expect(await codeOf(makeService().resolve('p1', design(over)))).toBe(expected);
  });

  /**
   * `maxChars` and `maxColors` were removed: both were a second, arbitrary
   * answer to a question the geometry already answers. A long name is refused
   * only when the hoop round it will not fit, and spools are bounded by
   * MAX_ELEMENTS because a box carries one.
   */
  /**
   * A shop cannot sell a name written in its customers' own alphabet if the
   * validator only knows Latin. Any script is spellable now; what is refused is
   * what no machine lays in thread.
   */
  it.each([
    ['Arabic', 'محمد'],
    ['Arabic with harakat', 'مُحَمَّد'],
    ['Cyrillic', 'Мария'],
    ['Greek', 'Μαρία'],
    ['Chinese', '張偉'],
    ['Latin with accents', 'Chloé'],
  ])('embroiders %s', async (_script, text) => {
    const r = await makeService().resolve('p1', design({ text, heightMm: 12 }));
    expect(r.text).toBe(text);
  });

  it('still refuses what has no thread — a picture is not a letter', async () => {
    const s = makeService();
    expect(await codeOf(s.resolve('p1', design({ text: 'Maria 🎀' })))).toBe(E.TEXT_UNSTITCHABLE);
    expect(await codeOf(s.resolve('p1', design({ text: '→ Maria' })))).toBe(E.TEXT_UNSTITCHABLE);
  });

  /**
   * A face used to declare its own 8–40mm range and refuse anything outside it.
   * That is an arbitrary answer to a question the geometry already answers, and
   * the same mistake `maxChars` made: the customer picks a size, and the hoop
   * decides whether it can be sewn.
   */
  it('takes a letter height no face would have allowed, if it fits the hoop', async () => {
    const s = makeService();
    const tiny = await s.resolve('p1', design({ text: 'Jo', heightMm: 2 }));
    const huge = await s.resolve('p1', design({ text: 'Jo', heightMm: 90 }));
    expect(tiny.heightMm).toBe(2);
    expect(huge.heightMm).toBe(90);
  });

  it('still refuses a size the hoop cannot hold, which is the real limit', async () => {
    // Lettering this size is past the machine's frame. It trips the width check
    // first here, because a taller letter is also a wider one — either way it is
    // the hoop refusing the design, which is the point.
    expect(await codeOf(makeService().resolve('p1', design({ text: 'Jo', heightMm: 1500 })))).toBe(E.TOO_WIDE);
  });

  it('takes a name longer than any character count would have allowed, if it fits', async () => {
    const s = makeService();
    // 15 characters on the back panel, which used to cap at 12.
    const r = await s.resolve('p1', design({ placementKey: 'back', text: 'Alexandria Rose', heightMm: 8 }));
    expect(r.text).toBe('Alexandria Rose');
  });

  it('still refuses it when it is too wide to hoop, which is the real limit', async () => {
    expect(await codeOf(makeService().resolve('p1', design({ placementKey: 'back', text: 'Alexandria Rose', heightMm: 40 })))).toBe(E.TOO_WIDE);
  });

  it('takes as many spools as there are boxes', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({
      placementKey: 'back', text: 'Jo', heightMm: 10,
      elements: [box({ threadColorId: TEAL.id, offsetYMm: -8 }), box({ threadColorId: PINK.id, offsetYMm: 0 }), box({ threadColorId: WHITE.id, offsetYMm: 8 })],
    }));
    // Three boxes, three spools — the back panel used to allow two.
    expect(r.threadColors).toHaveLength(3);
  });

  it('accepts the accents our locales actually use', async () => {
    const s = makeService();
    await expect(s.resolve('p1', design({ text: 'Chloé' }))).resolves.toBeDefined();
    await expect(s.resolve('p1', design({ text: 'Łukasz', heightMm: 12 }))).resolves.toBeDefined();
  });

  it('accepts the densest design the machine can hold — nothing is priced by how much thread it takes', async () => {
    // Three Varsity letters at 40mm, heaviest weight, in 3D puff, next to a
    // second box. This used to be past the top price band, which was also the
    // ceiling; there is no ceiling and no band now.
    const r = await makeService().resolve('p1', design({ elements: [box({ fontKey: 'serif-varsity', text: 'ABC', heightMm: 40, weight: 5, puff: true, threadColorId: TEAL.id, offsetYMm: 0 }), box({ text: 'Jo', heightMm: 18, threadColorId: TEAL.id, offsetYMm: 24 })] }));
    expect(r.elements).toHaveLength(2);
    // FRONT is free in this fixture, which is the point: the densest design
    // costs exactly what the plainest one on the same position costs.
    expect(r.priceCents).toBe(0);
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

describe('PersonalizationService.resolve — what it costs', () => {
  /**
   * The price was led by an estimated stitch count against a ladder of bands, so
   * the height, the weight and the foam all moved it — through a guess nothing
   * ever checked against a digitiser's real count. It is the position's own
   * price now, plus what the customer knowingly added.
   */
  it('does not move with the size, the weight or the foam', async () => {
    const s = makeService();
    const small = await s.resolve('p1', design({ heightMm: 10 }));
    const big = await s.resolve('p1', design({ heightMm: 20 }));
    const heavy = await s.resolve('p1', design({ heightMm: 30, weight: 5, puff: true }));

    expect(small.priceCents).toBe(0);
    expect(big.priceCents).toBe(0);
    expect(heavy.priceCents).toBe(0);
  });

  it('counts the spools on the hoop, which the sheet needs even though no price rides on it', async () => {
    const s = makeService();
    const same = await s.resolve('p1', design({ elements: [box({ text: 'Maria', heightMm: 20, threadColorId: TEAL.id, offsetYMm: -8 }), box({ threadColorId: TEAL.id })] }));
    const two = await s.resolve('p1', design({ elements: [box({ text: 'Maria', heightMm: 20, threadColorId: TEAL.id, offsetYMm: -8 }), box({ threadColorId: PINK.id })] }));

    expect(same.threadColors).toHaveLength(1);
    expect(two.threadColors).toHaveLength(2);
  });

  it('is the position’s own price', async () => {
    const s = makeService();
    const front = await s.resolve('p1', design({ heightMm: 10 }));
    const back = await s.resolve('p1', design({ placementKey: 'back', heightMm: 10 }));

    // FRONT is free in this fixture and BACK costs 150.
    expect(front.priceCents).toBe(0);
    expect(back.priceCents).toBe(150);
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

    // One flat figure per side, whatever goes on it.
    expect(small.priceCents).toBe(990);
    expect(heavy.priceCents).toBe(990);
  });

  it('charges a send-in by the side however heavy the design is', async () => {
    const s = makeService();
    // The panel is a fifth of the photo, so the photo is five panels wide — room enough.
    const customerItem = { itemType: 'cap', photoKeys: ['send-in/a.jpg'], corners: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }] };
    const r = await s.resolve('p1', design({ placementKey: 'side-1', text: 'ABCDEFGH', heightMm: 40, weight: 5, puff: true, fontKey: 'serif-varsity', customerItem }));
    // The densest thing the face allows, at the side's flat fee all the same.
    expect(r.priceCents).toBe(990);
  });

  it('bounds lettering on the customer’s own item by their photograph, not by a face', async () => {
    const s = makeService();
    const customerItem = { itemType: 'cap', photoKeys: ['send-in/a.jpg'], corners: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }] };
    // The photo here stands for 125mm, so 80mm is simply a size…
    const r = await s.resolve('p1', design({ placementKey: 'side-1', text: 'Jo', heightMm: 80, customerItem }));
    expect(r.elements[0].heightMm).toBe(80);
    // …and 140mm is taller than the item they sent.
    expect(await codeOf(s.resolve('p1', design({ placementKey: 'side-1', text: 'Jo', heightMm: 140, customerItem })))).toBe(E.TOO_TALL);
  });

  it('lets a shape or a logo grow to the photograph on the customer’s own item, and no further', async () => {
    const s = makeService();
    // Panel a fifth of the photo each way → the photo is 400 × 125 mm in the panel's millimetres (the side's field is 80 × 25).
    const customerItem = { itemType: 'cap', photoKeys: ['send-in/a.jpg'], corners: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }] };
    const big = await s.resolve('p1', design({ placementKey: 'side-1', contentType: 'motif', text: '', motifKey: 'heart', motifSizeMm: 110, customerItem }));
    expect(big.elements[0].motif?.sizeMm).toBe(110);
    expect(await codeOf(s.resolve('p1', design({ placementKey: 'side-1', contentType: 'motif', text: '', motifKey: 'heart', motifSizeMm: 130, customerItem })))).toBe('PERSONALIZATION_MOTIF_SIZE');
    // A catalogue position keeps the shape cap.
    expect(await codeOf(s.resolve('p1', design({ contentType: 'motif', text: '', motifKey: 'heart', motifSizeMm: 150 })))).toBe('PERSONALIZATION_MOTIF_SIZE');
    // A logo is clamped to the photo's width rather than refused.
    const logo = await s.resolve('p1', design({ placementKey: 'side-1', contentType: 'artwork', text: '', artworkKey: 'send-in/artwork/a.png', artworkSizeMm: 220, customerItem }));
    expect(logo.elements[0].artwork?.widthMm).toBe(220);
  });

  it('takes the customer’s own artwork on their item, sized by width and shaped by the file', async () => {
    const s = makeService();
    const customerItem = { itemType: 'cap', photoKeys: ['send-in/a.jpg'], corners: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }] };
    const r = await s.resolve('p1', design({ placementKey: 'side-1', contentType: 'artwork', text: '', artworkKey: 'send-in/artwork/a.png', artworkSizeMm: 80, customerItem }));
    const [el] = r.elements;

    expect(el.artwork).toMatchObject({ name: 'crest.svg', widthMm: 80, heightMm: 40 });
    expect(el.thread).toBeNull();
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

  it('is a stitch density the operator is told about, not a price input', async () => {
    const s = makeService();
    const light = await s.resolve('p1', design({ weight: 1 }));
    const bold = await s.resolve('p1', design({ weight: 5 }));

    expect(bold.fontWeight).toBe(900);
    // The heavier column is more thread and more machine time, but the shop's
    // price is its own figure: weight used to tip a design into a dearer band.
    expect(bold.priceCents).toBe(light.priceCents);
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

    // Each position's own price, once per position: FRONT is free in this
    // fixture and BACK costs 150.
    expect(one.totalCents).toBe(0);
    expect(both.totalCents).toBe(150);
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

  it('records the thread for the operator', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design());
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    expect(svg).toContain('Madeira Polyneon 1791 Teal');
  });

  it('escapes the customer’s text — it is the one part a stranger wrote', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ text: "Tom & Amy" }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    expect(svg).toContain('Tom &amp; Amy');
    expect(svg).not.toContain('Tom & Amy');
  });
});
