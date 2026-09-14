import { PersonalizationService } from './personalization.service';
import { PERSONALIZATION_ERRORS as E } from './personalization.constants';

/**
 * The design tools each change what the machine does, so each has to change the
 * stitch estimate, survive onto the production sheet, and be part of what makes
 * two designs different. These cover all three for every one of them.
 */

const FRONT = {
  id: 'pl-front', key: 'front',
  label: { en: 'Front panel' }, hint: null,
  fieldWidthMm: 110, fieldHeightMm: 55, maxColors: 3, maxChars: 14,
  priceCents: 0, isActive: true, allowPuff: true, mediaKey: 'm/front.jpg',
};
const NO_PUFF = { ...FRONT, id: 'pl-side', key: 'side', allowPuff: false };
/** A generous panel, so the stitch ceiling is reached long before the edges. */
const WIDE = { ...FRONT, id: 'pl-wide', key: 'wide', fieldWidthMm: 300, fieldHeightMm: 80, maxChars: 30 };

const BLOCK = {
  key: 'block-classic', name: 'Block', webFamily: 'sans-serif',
  minHeightMm: 8, maxHeightMm: 40, stitchesPerCharAt10mm: 130, avgCharWidthRatio: 0.62,
  uppercaseOnly: false, supportsMonogram: true, supportsPuff: true, supportsCurve: true, isActive: true,
};
const NO_CURVE = { ...BLOCK, key: 'script-joined', name: 'Joined', supportsCurve: false, supportsPuff: false };

const TEAL = { id: 't-1', brand: 'Madeira', code: '1791', name: 'Teal', hex: '#0d8f8c', isActive: true, finish: 'matte', priceMultiplier: 1 };
const PINK = { id: 't-2', brand: 'Madeira', code: '1921', name: 'Fuchsia', hex: '#c8186a', isActive: true, finish: 'matte', priceMultiplier: 1 };
const GOLD = { id: 't-3', brand: 'Madeira', code: '9842', name: 'Gold', hex: '#c9a227', isActive: true, finish: 'metallic', priceMultiplier: 1.5 };

const BANDS = [
  { maxStitches: 3000, priceCents: 800 },
  { maxStitches: 6000, priceCents: 1200 },
  { maxStitches: 9000, priceCents: 1800 },
];

const MOTIF = {
  key: 'heart', name: { en: 'Heart' }, path: 'M10 30 A20 20 0 0 1 50 30 Z',
  viewBox: '0 0 100 100', stitchesAt30mm: 2200, colorCount: 1, isActive: true,
};

function makeService() {
  const prisma = {
    product: { findUnique: jest.fn(async () => ({ id: 'p1', status: 'active', personalizationTemplateId: 'tpl-1' })) },
    personalizationTemplate: {
      findUnique: jest.fn(async () => ({
        id: 'tpl-1', key: 'cap', name: 'Cap', isActive: true,
        allowText: true, allowMonogram: true, allowUpload: false, priceBands: BANDS,
      })),
    },
    personalizationPlacement: {
      findUnique: jest.fn(async ({ where }: { where: { productId_key: { key: string } } }) =>
        where.productId_key.key === 'side' ? NO_PUFF : where.productId_key.key === 'wide' ? WIDE : FRONT,
      ),
    },
    embroideryFont: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        where.key === 'script-joined' ? NO_CURVE : BLOCK,
      ),
    },
    embroideryMotif: { findUnique: jest.fn(async ({ where }: { where: { key: string } }) => (where.key === 'heart' ? MOTIF : null)) },
    threadColor: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        [TEAL, PINK, GOLD].filter((t) => where.id.in.includes(t.id)),
      ),
    },
  };
  const assetUrls = { resolveBatch: jest.fn(async () => new Map<string, string>()) };
  return new PersonalizationService(prisma as never, assetUrls as never);
}

/**
 * Builds a one-box design from a flat override, so a spec reads as "Maria at
 * 20mm in teal" rather than as a nested document. Design-level keys go on the
 * position; everything else goes on the box. `threadColorIds` keeps its old
 * spelling — the first id is the box's spool.
 */
const DESIGN_KEYS = new Set(['placementKey', 'elements']);
const design = (over: Partial<Record<string, unknown>> = {}) => {
  const { threadColorIds, ...rest } = over as { threadColorIds?: string[] } & Record<string, unknown>;
  const position: Record<string, unknown> = { placementKey: 'front' };
  const box: Record<string, unknown> = {
    contentType: 'text',
    text: 'Maria',
    fontKey: 'block-classic',
    heightMm: 12,
    threadColorId: threadColorIds?.[0] ?? TEAL.id,
  };
  for (const [k, v] of Object.entries(rest)) (DESIGN_KEYS.has(k) ? position : box)[k] = v;
  return { ...position, elements: position.elements ?? [box] } as never;
};

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return ((err as { response?: { code?: string } }).response?.code ?? 'UNKNOWN') as string;
  }
}

const svgOf = async (over: Record<string, unknown> = {}) => {
  const s = makeService();
  const r = await s.resolve('p1', design(over));
  return s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });
};

describe('multiple lines', () => {
  it('splits on newlines and counts them', async () => {
    const r = await makeService().resolve('p1', design({ text: 'Maria\nRose' }));
    expect(r.lines).toEqual(['Maria', 'Rose']);
    expect(r.lineCount).toBe(2);
  });

  it('drops blank lines rather than stitching an empty row', async () => {
    const r = await makeService().resolve('p1', design({ text: 'Maria\n\n\nRose' }));
    expect(r.lines).toEqual(['Maria', 'Rose']);
  });

  it('still refuses an input that is nothing but blank lines', async () => {
    // Regression guard: filtering blanks leaves an empty array, not an empty
    // string, so the "enter some text" check has to look at the array.
    expect(await codeOf(makeService().resolve('p1', design({ text: '\n  \n' })))).toBe(E.TEXT_EMPTY);
  });

  it('refuses more lines than a hoop field can stack', async () => {
    expect(await codeOf(makeService().resolve('p1', design({ text: 'a\nb\nc\nd' })))).toBe(E.TOO_MANY_LINES);
  });

  it('refuses a stack taller than the machine can hoop', async () => {
    // Three 40mm lines bent along 150° rise ~85mm on top of their ~148mm
    // stack — past the 200mm frame.
    expect(await codeOf(makeService().resolve('p1', design({ placementKey: 'wide', text: 'Alexandra\nAlexandra\nAlexandra', heightMm: 40, curveDeg: 150 })))).toBe(E.TOO_TALL);
  });

  it('stacks them on the sheet, centred on the design', async () => {
    const svg = await svgOf({ text: 'Maria\nRose' });
    expect((svg.match(/<text /g) ?? []).length).toBe(2);
  });
});

describe('tracking and kerning', () => {
  it('widens the line as tracking opens', async () => {
    const s = makeService();
    const tight = await s.resolve('p1', design({ trackingPct: 0 }));
    const open = await s.resolve('p1', design({ trackingPct: 0.3 }));
    expect(open.widthMm).toBeGreaterThan(tight.widthMm);
  });

  it('counts gaps, not letters — five glyphs have four gaps', async () => {
    const s = makeService();
    const base = await s.resolve('p1', design({ trackingPct: 0 }));
    const open = await s.resolve('p1', design({ trackingPct: 0.1 }));
    // 4 gaps × 0.1 × 12mm = 4.8mm.
    expect(open.widthMm - base.widthMm).toBeCloseTo(4.8, 1);
  });

  it('keeps one kerning entry per gap and drops anything beyond', async () => {
    const r = await makeService().resolve('p1', design({ kerning: [0.1, -0.1, 0, 0.2, 9, 9, 9] }));
    expect(r.kerning).toEqual([0.1, -0.1, 0, 0.2]);
  });

  it('clamps a kerning nudge rather than rejecting it', async () => {
    const r = await makeService().resolve('p1', design({ kerning: [5, -5, 0, 0] }));
    expect(r.kerning).toEqual([0.4, -0.4, 0, 0]);
  });

  it('draws the sheet at the width the design was measured and quoted at', async () => {
    // One number across the fit check, the preview and the sheet. Letting each
    // use its own font's metrics is what made the editor warn about text that
    // visibly fitted: "Lilli" measures 62mm by the model and draws 40mm in
    // Helvetica.
    const s = makeService();
    const r = await s.resolve('p1', design({ trackingPct: 0.2 }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: 110, fieldHeightMm: 55 });

    expect(svg).toContain(`textLength="${r.widthMm}"`);
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
  });

  it('is part of the design — two spacings are two cart lines', async () => {
    const s = makeService();
    const a = await s.resolve('p1', design({ trackingPct: 0 }));
    const b = await s.resolve('p1', design({ trackingPct: 0.2 }));
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('curved text', () => {
  it('costs more stitches — the machine travels between glyphs', async () => {
    const s = makeService();
    const straight = await s.resolve('p1', design());
    const arched = await s.resolve('p1', design({ curveDeg: 60 }));
    expect(arched.stitchEstimate).toBeGreaterThan(straight.stitchEstimate);
  });

  it('eats height, so a deep arch on a tall stack overflows the frame', async () => {
    const s = makeService();
    const flat = await s.resolve('p1', design({ placementKey: 'wide', text: 'Alexandra\nAlexandra', heightMm: 20 }));
    const arched = await s.resolve('p1', design({ placementKey: 'wide', text: 'Alexandra\nAlexandra', heightMm: 20, curveDeg: 120 }));
    expect(arched.fieldHeightMm).toBeGreaterThan(flat.fieldHeightMm);
  });

  it('is refused on a face whose letters join', async () => {
    expect(await codeOf(makeService().resolve('p1', design({ fontKey: 'script-joined', curveDeg: 40 })))).toBe(
      E.CURVE_UNAVAILABLE,
    );
  });

  it('rides an arc path on the sheet rather than a straight baseline', async () => {
    const svg = await svgOf({ curveDeg: 60 });
    expect(svg).toContain('<textPath');
    expect(svg).toContain('curved 60°');
  });
});

/** A second box in another spool — how a second colour is asked for now. */
const box = (over: Record<string, unknown> = {}) => ({
  contentType: 'text',
  text: 'Rose',
  fontKey: 'block-classic',
  heightMm: 12,
  threadColorId: PINK.id,
  offsetXMm: 0,
  offsetYMm: 16,
  ...over,
});

describe('boxes', () => {
  it('lets a position carry several boxes, each in its own spool', async () => {
    const r = await makeService().resolve(
      'p1',
      design({ elements: [box({ text: 'Maria', threadColorId: TEAL.id, offsetYMm: -10 }), box({ text: 'Rose', threadColorId: PINK.id, offsetYMm: 10 })] }),
    );
    expect(r.elements).toHaveLength(2);
    expect(r.elements.map((el) => el.thread.code)).toEqual(['1791', '1921']);
    // The row's summary reads every box, in order, for anyone who never opens
    // the document.
    expect(r.text).toBe('Maria\nRose');
    expect(r.threadColors.map((t) => t.code)).toEqual(['1791', '1921']);
  });

  it('draws every box on the sheet, each placed and turned on its own', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ elements: [box({ text: 'Maria', threadColorId: TEAL.id, offsetYMm: -10 }), box({ rotationDeg: 30 })] }));
    const svg = s.buildProductionSvg(r, { fieldWidthMm: r.fieldWidthMm, fieldHeightMm: r.fieldHeightMm });
    // Boxes are drawn from the hoop's centre; the hoop's own offset puts them
    // back where the customer left them on the garment.
    expect(r.elements[0].offsetYMm + r.offsetYMm).toBeCloseTo(-10, 0);
    expect(r.elements[1].offsetYMm + r.offsetYMm).toBeCloseTo(16, 0);
    expect(svg).toContain('rotate(30)');
    expect(svg).toContain('fill="#0d8f8c"');
    expect(svg).toContain('fill="#c8186a"');
    expect(svg).toContain('2 boxes');
  });

  it('fits the hoop round the boxes, with clearance, rather than asking the customer to draw one', async () => {
    const s = makeService();
    const one = await s.resolve('p1', design());
    // "Maria" at 12mm is ~37mm wide; 4mm of clearance each side.
    expect(one.fieldWidthMm).toBeCloseTo(one.elements[0].widthMm + 8, 0);
    expect(one.fieldHeightMm).toBe(20);
    expect([one.offsetXMm, one.offsetYMm]).toEqual([0, 0]);

    const two = await s.resolve('p1', design({ elements: [box({ text: 'Maria', threadColorId: TEAL.id, offsetYMm: -20 }), box({ offsetYMm: 20 })] }));
    // From the top of the upper box to the bottom of the lower: 12 + 40 + 8.
    expect(two.fieldHeightMm).toBe(60);
    expect(two.offsetYMm).toBe(0);
  });

  it('refuses boxes spread wider than the machine can hoop, however small each is', async () => {
    expect(
      await codeOf(makeService().resolve('p1', design({ placementKey: 'wide', elements: [box({ offsetXMm: -140, threadColorId: TEAL.id }), box({ offsetXMm: 140 })] }))),
    ).toBe(E.TOO_WIDE);
  });

  it('clamps a box dragged off the garment rather than refusing the drag', async () => {
    // 1.5 × the traced panel, as the editor allows: 110 × 1.5 = 165 sideways.
    const r = await makeService().resolve('p1', design({ elements: [box({ offsetXMm: 999, offsetYMm: -999 })] }));
    expect([r.offsetXMm, r.offsetYMm]).toEqual([165, -82.5]);
  });

  it('names the box that is wrong, so the editor can open it', async () => {
    try {
      await makeService().resolve('p1', design({ elements: [box({ text: 'Maria', threadColorId: TEAL.id }), box({ text: 'a\nb\nc\nd' })] }));
      throw new Error('resolved');
    } catch (err) {
      const res = (err as { response?: Record<string, unknown> }).response;
      expect(res?.code).toBe(E.TOO_MANY_LINES);
      expect(res?.elementIndex).toBe(1);
    }
  });

  it('refuses an empty hoop', async () => {
    await expect(makeService().resolve('p1', design({ elements: [] }))).rejects.toBeDefined();
  });
});

describe('3D puff', () => {
  it('is refused where the position cannot take it', async () => {
    expect(await codeOf(makeService().resolve('p1', design({ placementKey: 'side', puff: true })))).toBe(
      E.PUFF_UNAVAILABLE,
    );
  });

  it('is refused on a face too fine to survive foam', async () => {
    expect(await codeOf(makeService().resolve('p1', design({ fontKey: 'script-joined', puff: true })))).toBe(
      E.PUFF_UNAVAILABLE,
    );
  });

  it('costs more and shouts on the sheet', async () => {
    const s = makeService();
    const flat = await s.resolve('p1', design());
    const puffed = await s.resolve('p1', design({ puff: true }));
    expect(puffed.stitchEstimate).toBeGreaterThan(flat.stitchEstimate);
    expect(await svgOf({ puff: true })).toContain('3D PUFF');
  });
});

describe('motifs', () => {
  it('accepts a shape with no lettering at all', async () => {
    // Regression guard: the DTO used to require a non-empty `text`, which made
    // a motif-only design impossible to submit — it has no words by definition.
    const r = await makeService().resolve('p1', design({ contentType: 'motif', text: '', motifKey: 'heart' }));
    expect(r.motif?.key).toBe('heart');
    expect(r.lines).toEqual([]);
  });

  it('prices a shape from its measured stitch count, scaled by area', async () => {
    const s = makeService();
    const small = await s.resolve('p1', design({ contentType: 'motif', motifKey: 'heart', motifSizeMm: 20 }));
    const big = await s.resolve('p1', design({ contentType: 'motif', motifKey: 'heart', motifSizeMm: 40 }));
    // Four times the area, so about four times the stitches. A 60mm shape is
    // deliberately not used here — it does not fit a 55mm field, which the
    // height check rightly refuses.
    expect(small.stitchEstimate).toBe(1058);
    expect(big.stitchEstimate / small.stitchEstimate).toBeCloseTo(3.8, 1);
  });

  it('refuses a shape that is not in the catalogue', async () => {
    expect(await codeOf(makeService().resolve('p1', design({ contentType: 'motif', motifKey: 'dragon' })))).toBe(
      E.MOTIF_UNKNOWN,
    );
  });

  it('refuses a size no hoop would take', async () => {
    expect(
      await codeOf(makeService().resolve('p1', design({ contentType: 'motif', motifKey: 'heart', motifSizeMm: 300 }))),
    ).toBe(E.MOTIF_SIZE);
  });

  it('draws the shape on the sheet, scaled and centred', async () => {
    const svg = await svgOf({ contentType: 'motif', motifKey: 'heart', motifSizeMm: 40 });
    expect(svg).toContain('<path d="M10 30');
    expect(svg).toContain('motif &quot;Heart&quot; at 40mm');
  });
});

describe('thread finish', () => {
  it('charges more for a thread that runs slower', async () => {
    const s = makeService();
    const matte = await s.resolve('p1', design());
    const metallic = await s.resolve('p1', design({ threadColorIds: [GOLD.id] }));
    expect(metallic.priceCents).toBe(Math.round(matte.priceCents * 1.5));
  });

  it('takes the dearest thread on the design — the machine is as slow as its slowest pass', async () => {
    const r = await makeService().resolve('p1', design({ elements: [box({ threadColorId: TEAL.id }), box({ threadColorId: GOLD.id })] }));
    // Two boxes of four letters at 12mm plus a colour change sit in the 800
    // band; ×1.5 for the metallic spool.
    expect(r.priceCents).toBe(1200);
  });

  it('names the finish on the sheet so the right cone is loaded', async () => {
    expect(await svgOf({ threadColorIds: [GOLD.id] })).toContain('finish: metallic');
  });
});

describe('rendering a stored row', () => {
  /**
   * The renderer takes the resolved shape, but production reads flat database
   * columns. Everything derived — the split lines, the gathered motif, the
   * measured width — has to be rebuilt on the way in, and a miss there is
   * invisible: the render throws, the caller catches, and sheets come back
   * empty or full of NaN.
   */
  it('rebuilds a curved multi-line row without a single NaN', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ text: 'Maria\nRose', curveDeg: 40, trackingPct: 0.15 }));

    // Exactly what the order paths hand the artwork builder.
    const row = {
      ...r,
      text: r.text,
      designJson: r.designJson,
      motifKey: null, motifName: null, motifPath: null, motifViewBox: null, motifSizeMm: null,
      outlineThread: null,
      lines: undefined,
      motif: undefined,
      widthMm: undefined,
    };

    const svgs = await s.buildArtworkForCartItems([{ id: 'ci-1', personalizations: [row as never] }]);
    const svg = svgs.get('ci-1:front');

    expect(svg).toBeDefined();
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('<textPath');
    expect((svg!.match(/<text /g) ?? []).length).toBe(2);
  });

  it('rebuilds a motif row from its frozen columns', async () => {
    const s = makeService();
    const r = await s.resolve('p1', design({ contentType: 'motif', text: '', motifKey: 'heart', motifSizeMm: 30 }));
    const row = {
      ...r,
      designJson: r.designJson,
      motifKey: r.motif!.key, motifName: r.motif!.name, motifPath: r.motif!.path,
      motifViewBox: r.motif!.viewBox, motifSizeMm: r.motif!.sizeMm,
      outlineThread: null, lines: undefined, motif: undefined, widthMm: undefined,
    };

    const svg = (await s.buildArtworkForCartItems([{ id: 'ci-2', personalizations: [row as never] }])).get('ci-2:front');
    expect(svg).toContain('<path d="M10 30');
    expect(svg).not.toContain('NaN');
  });
});

describe('the stitch ceiling', () => {
  /**
   * The ceiling is machine time, not space. A bold puffed name can occupy a
   * fifth of a wide panel and still be three times the stitches of the plain
   * one, so the error has to say what is actually wrong and which switch to
   * flip — telling someone to shorten their text when the foam is the
   * problem sends them to fix the one thing that is not.
   */
  const over = async (over: Record<string, unknown>) => {
    try {
      await makeService().resolve('p1', design(over));
      return null;
    } catch (err) {
      return (err as { response?: Record<string, unknown> }).response ?? null;
    }
  };

  it('reports the estimate and the ceiling, not a vague "too large"', async () => {
    // ~11,400 stitches against a 9,000 ceiling.
    const res = await over({ placementKey: 'wide', text: 'Alexandra', heightMm: 30, weight: 5, puff: true });
    expect(res?.code).toBe(E.TOO_MANY_STITCHES);
    expect(res?.stitchEstimate).toBeGreaterThan(9000);
    expect(res?.maxStitches).toBe(9000);
    expect(String(res?.message)).toContain('stitches');
  });

  it('names the puff when dropping it alone would fit', async () => {
    // 7,174 stitches flat; 9,657 puffed, against a 9,000 ceiling.
    const res = await over({ placementKey: 'wide', text: 'Alexandra', heightMm: 40, weight: 2, puff: true });
    expect(res?.relax).toBe('puff');
  });

  it('names the heaviest contributor when several are on', async () => {
    // Weight (×1.42) beats puff (×1.35), so it is the one to drop first:
    // 11,510 as chosen, 8,130 at regular weight.
    const res = await over({ placementKey: 'wide', text: 'Alexandra', heightMm: 35, weight: 4, puff: true });
    expect(res?.relax).toBe('weight');
  });

  it('names nothing when no single switch is enough — the size has to give', async () => {
    // 40mm is the face's own ceiling, so this is as big as it goes: ~16,550
    // stitches. Dropping the puff still leaves ~12,300 and dropping the
    // weight ~9,660 — both over the 9,000, so nothing short of a smaller
    // design will do and the error says so by naming none of them.
    const res = await over({ placementKey: 'wide', text: 'Alexandra', heightMm: 40, weight: 5, puff: true });
    expect(res?.relax).toBeNull();
  });

  it('looks for the switch on the heaviest box, not on whichever box happens to have one', async () => {
    // A 40mm bold name (~12,300) next to a tiny puffed box. The puff is the
    // only switch on the tiny box, but dropping it saves a few hundred
    // stitches of a 12,000 total; the weight on the big box is what brings
    // the position back under, so that is the one named — and the error
    // points at that box.
    const res = await over({
      placementKey: 'wide',
      elements: [
        box({ text: 'Alexandra', heightMm: 40, weight: 5, threadColorId: TEAL.id, offsetYMm: -10 }),
        box({ text: 'Jo', heightMm: 10, puff: true, threadColorId: TEAL.id, offsetYMm: 25 }),
      ],
    });
    expect(res?.code).toBe(E.TOO_MANY_STITCHES);
    expect(res?.elementIndex).toBe(0);
    expect(res?.relax).toBe('weight');
  });
});
