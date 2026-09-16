/**
 * The starting catalogue an embroidery shop needs before the editor can show
 * anything: faces that have been digitised, threads that can actually be
 * bought, and the hoop fields of a six-panel cap.
 *
 * Every number here is a real-world measurement rather than a guess at what
 * looks nice, because the editor's job is to refuse designs the machine cannot
 * sew. Change them when you change supplier or machine, not to make a design
 * fit.
 */

export interface FontSeed {
  key: string;
  name: string;
  webFamily: string;
  /** Where the browser fetches the face from — a Google Fonts stylesheet. */
  webFontCss?: string;
  minHeightMm: number;
  maxHeightMm: number;
  stitchesPerCharAt10mm: number;
  avgCharWidthRatio: number;
  uppercaseOnly: boolean;
  supportsMonogram: boolean;
  /** Puff needs wide flat columns; a fine script collapses over foam. */
  supportsPuff: boolean;
  /** A joined face breaks at the joins when bent along an arc. */
  supportsCurve: boolean;
  sortOrder: number;
}

/** A Google Fonts stylesheet for one family, every weight the editor's thickness steps use. */
const gf = (family: string, weights = '400;500;600;700;800') => `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weights}&display=swap`;
const gf1 = (family: string) => `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&display=swap`;

/**
 * `webFamily` names the face the editor draws with; `webFontCss` is where the
 * browser gets it. Loaded only on the editor page, only for the faces the
 * shop offers — the preview has to show a customer the face they will get,
 * on whatever phone they are holding, and a system fallback does not.
 */
export const FONT_SEED: FontSeed[] = [
  { key: 'block-classic', name: 'Block', webFamily: '"Inter", "Helvetica Neue", Arial, sans-serif', webFontCss: gf('Inter'), minHeightMm: 8, maxHeightMm: 40, stitchesPerCharAt10mm: 130, avgCharWidthRatio: 0.62, uppercaseOnly: false, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 10 },
  { key: 'block-bold', name: 'Block Bold', webFamily: '"Archivo Black", "Arial Black", "Helvetica Neue", sans-serif', webFontCss: gf1('Archivo Black'), minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 180, avgCharWidthRatio: 0.70, uppercaseOnly: false, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 20 },
  { key: 'script-classic', name: 'Script', webFamily: '"Dancing Script", "Snell Roundhand", "Brush Script MT", cursive', webFontCss: gf('Dancing Script', '400;500;600;700'), minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 150, avgCharWidthRatio: 0.55, uppercaseOnly: false, supportsMonogram: true, supportsPuff: false, supportsCurve: true, sortOrder: 30 },
  { key: 'script-signature', name: 'Signature', webFamily: '"Great Vibes", "Zapfino", "Segoe Script", cursive', webFontCss: gf1('Great Vibes'), minHeightMm: 12, maxHeightMm: 40, stitchesPerCharAt10mm: 175, avgCharWidthRatio: 0.58, uppercaseOnly: false, supportsMonogram: false, supportsPuff: false, supportsCurve: false, sortOrder: 40 },
  { key: 'serif-varsity', name: 'Varsity', webFamily: '"Graduate", "Bookman Old Style", Georgia, serif', webFontCss: gf1('Graduate'), minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 200, avgCharWidthRatio: 0.74, uppercaseOnly: true, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 50 },
  { key: 'serif-classic', name: 'Serif', webFamily: '"Playfair Display", Georgia, "Times New Roman", serif', webFontCss: gf('Playfair Display'), minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 145, avgCharWidthRatio: 0.60, uppercaseOnly: false, supportsMonogram: true, supportsPuff: false, supportsCurve: true, sortOrder: 60 },
  { key: 'sans-modern', name: 'Modern', webFamily: '"Montserrat", "Futura", "Century Gothic", sans-serif', webFontCss: gf('Montserrat'), minHeightMm: 8, maxHeightMm: 40, stitchesPerCharAt10mm: 125, avgCharWidthRatio: 0.64, uppercaseOnly: false, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 70 },
  { key: 'sans-rounded', name: 'Rounded', webFamily: '"Fredoka", "Arial Rounded MT Bold", sans-serif', webFontCss: gf('Fredoka', '400;500;600;700'), minHeightMm: 8, maxHeightMm: 40, stitchesPerCharAt10mm: 140, avgCharWidthRatio: 0.64, uppercaseOnly: false, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 90 },
  { key: 'display-bebas', name: 'Display', webFamily: '"Bebas Neue", "Impact", sans-serif', webFontCss: gf1('Bebas Neue'), minHeightMm: 8, maxHeightMm: 40, stitchesPerCharAt10mm: 120, avgCharWidthRatio: 0.48, uppercaseOnly: true, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 100 },
  { key: 'hand-caveat', name: 'Handwritten', webFamily: '"Caveat", "Segoe Print", cursive', webFontCss: gf('Caveat', '400;500;600;700'), minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 130, avgCharWidthRatio: 0.5, uppercaseOnly: false, supportsMonogram: false, supportsPuff: false, supportsCurve: true, sortOrder: 110 },
  { key: 'brush-marker', name: 'Brush', webFamily: '"Permanent Marker", "Marker Felt", cursive', webFontCss: gf1('Permanent Marker'), minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 170, avgCharWidthRatio: 0.62, uppercaseOnly: false, supportsMonogram: true, supportsPuff: false, supportsCurve: true, sortOrder: 120 },
  { key: 'retro-lobster', name: 'Retro', webFamily: '"Lobster", "Cooper Black", cursive', webFontCss: gf1('Lobster'), minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 165, avgCharWidthRatio: 0.58, uppercaseOnly: false, supportsMonogram: true, supportsPuff: false, supportsCurve: true, sortOrder: 130 },
  { key: 'gothic-pirata', name: 'Gothic', webFamily: '"Pirata One", "Old English Text MT", serif', webFontCss: gf1('Pirata One'), minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 160, avgCharWidthRatio: 0.56, uppercaseOnly: false, supportsMonogram: true, supportsPuff: false, supportsCurve: false, sortOrder: 140 },
  { key: 'slab-alfa', name: 'Slab', webFamily: '"Alfa Slab One", "Rockwell", serif', webFontCss: gf1('Alfa Slab One'), minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 190, avgCharWidthRatio: 0.7, uppercaseOnly: false, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 150 },
  { key: 'comic-bangers', name: 'Comic', webFamily: '"Bangers", "Impact", sans-serif', webFontCss: gf1('Bangers'), minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 150, avgCharWidthRatio: 0.52, uppercaseOnly: true, supportsMonogram: true, supportsPuff: true, supportsCurve: true, sortOrder: 160 },
  { key: 'mono-typewriter', name: 'Typewriter', webFamily: '"Courier Prime", "Courier New", monospace', webFontCss: gf('Courier Prime', '400;700'), minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 135, avgCharWidthRatio: 0.6, uppercaseOnly: false, supportsMonogram: true, supportsPuff: false, supportsCurve: true, sortOrder: 170 },
  { key: 'serif-elegant', name: 'Elegant', webFamily: '"Cormorant Garamond", "Garamond", serif', webFontCss: gf('Cormorant Garamond', '400;500;600;700'), minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 140, avgCharWidthRatio: 0.55, uppercaseOnly: false, supportsMonogram: true, supportsPuff: false, supportsCurve: true, sortOrder: 180 },
  { key: 'mono-stencil', name: 'Stencil', webFamily: '"Allerta Stencil", "Courier New", ui-monospace, monospace', webFontCss: gf1('Allerta Stencil'), minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 135, avgCharWidthRatio: 0.68, uppercaseOnly: true, supportsMonogram: false, supportsPuff: true, supportsCurve: true, sortOrder: 80 },
];

export interface ThreadSeed {
  code: string;
  name: string;
  hex: string;
  sortOrder: number;
}

/**
 * Madeira Polyneon 40 — the range most contract embroiderers keep on the wall.
 * Twenty-four spools is a deliberate ceiling: every extra colour is a spool
 * that has to be in stock the day an order lands, and a wall of 400 swatches
 * makes the editor worse, not better.
 *
 * The brand's own teal and pink lead the list so a personalised cap reads as
 * this shop's rather than generic.
 */
export const THREAD_SEED: ThreadSeed[] = [
  { code: '1791', name: 'Teal', hex: '#0d8f8c', sortOrder: 10 },
  { code: '1921', name: 'Fuchsia', hex: '#c8186a', sortOrder: 20 },
  { code: '1000', name: 'White', hex: '#ffffff', sortOrder: 30 },
  { code: '1001', name: 'Black', hex: '#161616', sortOrder: 40 },
  { code: '1082', name: 'Cream', hex: '#efe6d2', sortOrder: 50 },
  { code: '1070', name: 'Silver Grey', hex: '#b9bec4', sortOrder: 60 },
  { code: '1041', name: 'Charcoal', hex: '#3b414b', sortOrder: 70 },
  { code: '1147', name: 'Navy', hex: '#1d2a47', sortOrder: 80 },
  { code: '1134', name: 'Royal Blue', hex: '#1f4fa8', sortOrder: 90 },
  { code: '1196', name: 'Sky Blue', hex: '#79b4dd', sortOrder: 100 },
  { code: '1249', name: 'Dusty Blue', hex: '#8fb9c8', sortOrder: 110 },
  { code: '1250', name: 'Mint', hex: '#8fd6bd', sortOrder: 120 },
  { code: '1051', name: 'Kelly Green', hex: '#1f8a4c', sortOrder: 130 },
  { code: '1169', name: 'Olive', hex: '#6b7340', sortOrder: 140 },
  { code: '1024', name: 'Lemon', hex: '#f2d14b', sortOrder: 150 },
  { code: '1173', name: 'Gold', hex: '#c9a227', sortOrder: 160 },
  { code: '1178', name: 'Orange', hex: '#e8752a', sortOrder: 170 },
  { code: '1039', name: 'Coral', hex: '#f0796f', sortOrder: 180 },
  { code: '1147b', name: 'Blush Pink', hex: '#d9548c', sortOrder: 190 },
  { code: '1109', name: 'Rose', hex: '#e0a6b8', sortOrder: 200 },
  { code: '1181', name: 'Red', hex: '#c22033', sortOrder: 210 },
  { code: '1035', name: 'Burgundy', hex: '#7a1f35', sortOrder: 220 },
  { code: '1032', name: 'Purple', hex: '#6b3fa0', sortOrder: 230 },
  { code: '1058', name: 'Chocolate', hex: '#4b3226', sortOrder: 240 },
];

export interface PlacementSeed {
  key: string;
  /** Localized maps — the admin's Generate button fills the rest from these. */
  label: Record<string, string>;
  hint: Record<string, string>;
  fieldWidthMm: number;
  fieldHeightMm: number;
  maxColors: number;
  maxChars: number;
  previewXPct: number;
  previewYPct: number;
  previewWidthPct: number;
  previewHeightPct: number;
  previewRotateDeg: number;
  /** What this position costs, on top of the stitch band. */
  priceCents: number;
  sortOrder: number;
}

/**
 * A six-panel cap on a standard cap frame. The millimetre fields are the
 * frame's usable window, not the panel's size — the seam either side of the
 * front panel is what really bounds a design, which is why 110mm and not the
 * panel's full width.
 *
 * These are only a starting point: positions are admin-managed now, and a shop
 * is expected to rename, reprice, add and remove them. Seeded in English only,
 * because the admin's Generate button is how the other six get written.
 *
 * The side and back cost more: identical stitches, but the cap has to come off
 * the frame and go back on rotated, and that re-hoop is most of the operator's
 * time on a small job.
 */
export const CAP_PLACEMENT_SEED: PlacementSeed[] = [
  {
    key: 'front',
    label: { en: 'Front panel' },
    hint: { en: 'Centred above the peak — the classic position' },
    fieldWidthMm: 110, fieldHeightMm: 55, maxColors: 3, maxChars: 14,
    previewXPct: 34, previewYPct: 43, previewWidthPct: 32, previewHeightPct: 14,
    previewRotateDeg: 0, priceCents: 0, sortOrder: 10,
  },
  {
    key: 'side',
    label: { en: 'Side' },
    hint: { en: 'Small and subtle, above the left ear' },
    fieldWidthMm: 60, fieldHeightMm: 30, maxColors: 2, maxChars: 10,
    previewXPct: 18, previewYPct: 50, previewWidthPct: 16, previewHeightPct: 8,
    previewRotateDeg: -4, priceCents: 150, sortOrder: 20,
  },
  {
    key: 'back',
    label: { en: 'Back strap' },
    hint: { en: 'Above the closure — seen when you walk away' },
    fieldWidthMm: 80, fieldHeightMm: 25, maxColors: 2, maxChars: 12,
    previewXPct: 62, previewYPct: 62, previewWidthPct: 22, previewHeightPct: 7,
    previewRotateDeg: 0, priceCents: 150, sortOrder: 30,
  },
];

export interface PriceBandSeed {
  maxStitches: number;
  priceCents: number;
  label: string;
}

/**
 * Stitch bands, not character counts — machine time is stitches. Three bands
 * is as many as a customer can hold in their head, and the jump between them
 * is visible enough to nudge toward the small one.
 *
 * The top band is also the hard ceiling: a design past 9000 stitches is a
 * quarter of an hour on the machine and belongs in a quote, not a checkout.
 */
export const PRICE_BAND_SEED: PriceBandSeed[] = [
  { maxStitches: 3000, priceCents: 800, label: 'Small' },
  { maxStitches: 6000, priceCents: 1200, label: 'Medium' },
  { maxStitches: 9000, priceCents: 1800, label: 'Large' },
];

export const DEFAULT_TEMPLATE_KEY = 'cap-standard';
export const DEFAULT_TEMPLATE_NAME = 'Cap — standard embroidery';
export const THREAD_BRAND = 'Madeira Polyneon';

export interface MotifSeed {
  key: string;
  name: Record<string, string>;
  path: string;
  viewBox: string;
  stitchesAt30mm: number;
  category: string;
  sortOrder: number;
  /** A full-colour design: shapes drawn in order, each in its own colour. `path` is then the silhouette. */
  paths?: { d: string; fill: string }[];
  colorCount?: number;
}

/**
 * A starter set of shapes.
 *
 * Simple, solid silhouettes on purpose: a single closed path is what digitises
 * cleanly into one satin-filled shape, and it is what a customer recognises at
 * 25mm on a cap. Fine line art disappears at embroidery sizes.
 *
 * Stitch counts are measured from a 30mm stitch-out; the estimator scales them
 * by area from there.
 */
export const MOTIF_SEED: MotifSeed[] = [
  {
    key: 'youtube', name: { en: 'YouTube', fr: 'YouTube', es: 'YouTube', it: 'YouTube', de: 'YouTube', nl: 'YouTube', pl: 'YouTube' }, category: 'social', stitchesAt30mm: 2600, sortOrder: 200, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M16 20h68a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12H16A12 12 0 0 1 4 68V32a12 12 0 0 1 12-12Z',
    paths: [{ d: 'M16 20h68a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12H16A12 12 0 0 1 4 68V32a12 12 0 0 1 12-12Z', fill: '#FF0000' }, { d: 'M41 35v30l26-15Z', fill: '#FFFFFF' }],
  },
  {
    key: 'instagram', name: { en: 'Instagram', fr: 'Instagram', es: 'Instagram', it: 'Instagram', de: 'Instagram', nl: 'Instagram', pl: 'Instagram' }, category: 'social', stitchesAt30mm: 3400, sortOrder: 202, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M22 6h56a16 16 0 0 1 16 16v56a16 16 0 0 1-16 16H22A16 16 0 0 1 6 78V22A16 16 0 0 1 22 6Z',
    paths: [{ d: 'M22 6h56a16 16 0 0 1 16 16v56a16 16 0 0 1-16 16H22A16 16 0 0 1 6 78V22A16 16 0 0 1 22 6Z', fill: '#D62976' }, { d: 'M27 50a23 23 0 1 0 46 0a23 23 0 1 0 -46 0Z', fill: '#FFFFFF' }, { d: 'M35 50a15 15 0 1 0 30 0a15 15 0 1 0 -30 0Z', fill: '#D62976' }, { d: 'M68 26a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z', fill: '#FFFFFF' }],
  },
  {
    key: 'tiktok', name: { en: 'TikTok', fr: 'TikTok', es: 'TikTok', it: 'TikTok', de: 'TikTok', nl: 'TikTok', pl: 'TikTok' }, category: 'social', stitchesAt30mm: 3600, sortOrder: 204, colorCount: 4,
    viewBox: '0 0 100 100',
    path: 'M22 6h56a16 16 0 0 1 16 16v56a16 16 0 0 1-16 16H22A16 16 0 0 1 6 78V22A16 16 0 0 1 22 6Z',
    paths: [{ d: 'M22 6h56a16 16 0 0 1 16 16v56a16 16 0 0 1-16 16H22A16 16 0 0 1 6 78V22A16 16 0 0 1 22 6Z', fill: '#111111' }, { d: 'M52 18h12c1 8 6 13 14 14v11c-5 0-10-2-14-5v22a17 17 0 1 1-17-17h3v11h-3a6 6 0 1 0 6 6Z', fill: '#25F4EE' }, { d: 'M48 22h12c1 8 6 13 14 14v11c-5 0-10-2-14-5v22a17 17 0 1 1-17-17h3v11h-3a6 6 0 1 0 6 6Z', fill: '#FE2C55' }, { d: 'M50 20h12c1 8 6 13 14 14v11c-5 0-10-2-14-5v22a17 17 0 1 1-17-17h3v11h-3a6 6 0 1 0 6 6Z', fill: '#FFFFFF' }],
  },
  {
    key: 'facebook', name: { en: 'Facebook', fr: 'Facebook', es: 'Facebook', it: 'Facebook', de: 'Facebook', nl: 'Facebook', pl: 'Facebook' }, category: 'social', stitchesAt30mm: 3000, sortOrder: 206, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#1877F2' }, { d: 'M56 92V60h10l2-12H56v-8c0-4 1-6 6-6h6V23c-2 0-6-1-11-1-11 0-17 6-17 17v9H30v12h10v32Z', fill: '#FFFFFF' }],
  },
  {
    key: 'whatsapp', name: { en: 'WhatsApp', fr: 'WhatsApp', es: 'WhatsApp', it: 'WhatsApp', de: 'WhatsApp', nl: 'WhatsApp', pl: 'WhatsApp' }, category: 'social', stitchesAt30mm: 3200, sortOrder: 208, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 6a44 44 0 0 1 37 68L94 94l-21-6A44 44 0 1 1 50 6Z',
    paths: [{ d: 'M50 6a44 44 0 0 1 37 68L94 94l-21-6A44 44 0 1 1 50 6Z', fill: '#25D366' }, { d: 'M36 28c2-2 5-1 6 1l4 9c1 2 0 4-2 6l-2 2c3 6 8 11 14 14l2-2c2-2 4-3 6-2l9 4c2 1 3 4 1 6-3 5-8 8-14 7C43 70 30 57 27 40c-1-5 3-9 9-12Z', fill: '#FFFFFF' }],
  },
  {
    key: 'x-social', name: { en: 'X', fr: 'X', es: 'X', it: 'X', de: 'X', nl: 'X', pl: 'X' }, category: 'social', stitchesAt30mm: 2800, sortOrder: 210, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#111111' }, { d: 'M28 26h14l12 17 14-17h9L60 50l22 24H68L55 57 40 74h-9l21-24Z', fill: '#FFFFFF' }],
  },
  {
    key: 'linkedin', name: { en: 'LinkedIn', fr: 'LinkedIn', es: 'LinkedIn', it: 'LinkedIn', de: 'LinkedIn', nl: 'LinkedIn', pl: 'LinkedIn' }, category: 'social', stitchesAt30mm: 3300, sortOrder: 212, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M22 6h56a16 16 0 0 1 16 16v56a16 16 0 0 1-16 16H22A16 16 0 0 1 6 78V22A16 16 0 0 1 22 6Z',
    paths: [{ d: 'M22 6h56a16 16 0 0 1 16 16v56a16 16 0 0 1-16 16H22A16 16 0 0 1 6 78V22A16 16 0 0 1 22 6Z', fill: '#0A66C2' }, { d: 'M24 40h12v36H24ZM23 28a7 7 0 1 0 14 0a7 7 0 1 0 -14 0ZM44 40h12v5c3-4 8-6 13-6 10 0 15 6 15 17v20H72V58c0-6-2-9-7-9s-8 3-8 9v18H44Z', fill: '#FFFFFF' }],
  },
  {
    key: 'spotify', name: { en: 'Spotify', fr: 'Spotify', es: 'Spotify', it: 'Spotify', de: 'Spotify', nl: 'Spotify', pl: 'Spotify' }, category: 'social', stitchesAt30mm: 3000, sortOrder: 214, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#1DB954' }, { d: 'M26 38c16-5 36-4 50 4l-3 6c-13-7-31-8-45-4Zm3 14c13-4 29-3 40 3l-3 5c-10-5-24-6-35-3Zm3 12c10-3 22-2 30 2l-2 5c-8-4-18-5-26-2Z', fill: '#111111' }],
  },
  {
    key: 'rainbow', name: { en: 'Rainbow', fr: 'Arc-en-ciel', es: 'Arcoíris', it: 'Arcobaleno', de: 'Regenbogen', nl: 'Regenboog', pl: 'Tęcza' }, category: 'modern', stitchesAt30mm: 3400, sortOrder: 300, colorCount: 4,
    viewBox: '0 0 100 100',
    path: 'M4 76a46 46 0 0 1 92 0Z',
    paths: [{ d: 'M4 76a46 46 0 0 1 92 0h-12a34 34 0 0 0-68 0Z', fill: '#F44336' }, { d: 'M16 76a34 34 0 0 1 68 0H72a22 22 0 0 0-44 0Z', fill: '#FFC107' }, { d: 'M28 76a22 22 0 0 1 44 0H60a10 10 0 0 0-20 0Z', fill: '#4CAF50' }, { d: 'M40 76a10 10 0 0 1 20 0Z', fill: '#2196F3' }],
  },
  {
    key: 'sunset-badge', name: { en: 'Sunset', fr: 'Coucher de soleil', es: 'Atardecer', it: 'Tramonto', de: 'Sonnenuntergang', nl: 'Zonsondergang', pl: 'Zachód słońca' }, category: 'modern', stitchesAt30mm: 3600, sortOrder: 302, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#1B2A49' }, { d: 'M28 52a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z', fill: '#FF7A18' }, { d: 'M12 56h76v6H12Z', fill: '#1B2A49' }, { d: 'M12 66h76v5H12Z', fill: '#1B2A49' }, { d: 'M16 74c8-4 18-4 28 0s20 4 28 0l6 8H10Z', fill: '#5C2E91' }],
  },
  {
    key: 'planet', name: { en: 'Planet', fr: 'Planète', es: 'Planeta', it: 'Pianeta', de: 'Planet', nl: 'Planeet', pl: 'Planeta' }, category: 'modern', stitchesAt30mm: 3600, sortOrder: 304, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M24 50a26 26 0 1 0 52 0a26 26 0 1 0 -52 0Z',
    paths: [{ d: 'M24 50a26 26 0 1 0 52 0a26 26 0 1 0 -52 0Z', fill: '#7B5CFF' }, { d: 'M50 34c14 0 22 6 22 12s-8 8-22 8-22-2-22-8 8-12 22-12Z', fill: '#5A3FD6' }, { d: 'M6 60c10-14 60-26 88-18-4 6-16 10-30 14C40 62 20 66 6 60Zm4-2c12 4 30 0 52-6-16 2-40 2-52 6Z', fill: '#FFC93C' }],
  },
  {
    key: 'rocket', name: { en: 'Rocket', fr: 'Fusée', es: 'Cohete', it: 'Razzo', de: 'Rakete', nl: 'Raket', pl: 'Rakieta' }, category: 'modern', stitchesAt30mm: 3800, sortOrder: 306, colorCount: 4,
    viewBox: '0 0 100 100',
    path: 'M50 4c14 12 20 30 18 52H32C30 34 36 16 50 4Z',
    paths: [{ d: 'M50 4c14 12 20 30 18 52H32C30 34 36 16 50 4Z', fill: '#F2F4F7' }, { d: 'M32 44 16 66l16 6Zm36 0 16 22-16 6Z', fill: '#F44336' }, { d: 'M42 38a8 8 0 1 0 16 0a8 8 0 1 0 -16 0Z', fill: '#2196F3' }, { d: 'M40 72h20l-4 10h-12Z', fill: '#F44336' }, { d: 'M44 82h12l-6 14Z', fill: '#FFC107' }],
  },
  {
    key: 'bolt-badge', name: { en: 'Power', fr: 'Énergie', es: 'Energía', it: 'Energia', de: 'Energie', nl: 'Energie', pl: 'Energia' }, category: 'modern', stitchesAt30mm: 3000, sortOrder: 308, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#FFD600' }, { d: 'M56 16 30 54h16l-6 30 30-40H54Z', fill: '#111111' }],
  },
  {
    key: 'heart-glossy', name: { en: 'Pink heart', fr: 'Cœur rose', es: 'Corazón rosa', it: 'Cuore rosa', de: 'Rosa Herz', nl: 'Roze hart', pl: 'Różowe serce' }, category: 'love', stitchesAt30mm: 2800, sortOrder: 310, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 90 12 52a22 22 0 0 1 31-31l7 7 7-7a22 22 0 0 1 31 31Z',
    paths: [{ d: 'M50 90 12 52a22 22 0 0 1 31-31l7 7 7-7a22 22 0 0 1 31 31Z', fill: '#FF4D8D' }, { d: 'M26 40a8 5 0 1 0 16 0a8 5 0 1 0 -16 0Z', fill: '#FFFFFF' }],
  },
  {
    key: 'flame', name: { en: 'Flame', fr: 'Flamme', es: 'Llama', it: 'Fiamma', de: 'Flamme', nl: 'Vlam', pl: 'Płomień' }, category: 'modern', stitchesAt30mm: 3200, sortOrder: 312, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 4c6 16 24 26 24 50a24 24 0 0 1-48 0c0-10 4-16 10-22 0 8 4 12 8 12-4-14 0-30 6-40Z',
    paths: [{ d: 'M50 4c6 16 24 26 24 50a24 24 0 0 1-48 0c0-10 4-16 10-22 0 8 4 12 8 12-4-14 0-30 6-40Z', fill: '#FF6A00' }, { d: 'M50 44c4 8 12 12 12 24a12 12 0 0 1-24 0c0-8 6-10 6-18 2 4 4 6 6 6-2-6 0-8 6-12Z', fill: '#FFD200' }],
  },
  {
    key: 'star-badge', name: { en: 'Gold star', fr: 'Étoile dorée', es: 'Estrella dorada', it: 'Stella d’oro', de: 'Goldstern', nl: 'Gouden ster', pl: 'Złota gwiazda' }, category: 'shapes', stitchesAt30mm: 3200, sortOrder: 314, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M50 2 63 36h36L70 58l11 36-31-22-31 22 11-36L2 36h36Z',
    paths: [{ d: 'M50 2 63 36h36L70 58l11 36-31-22-31 22 11-36L2 36h36Z', fill: '#1B2A49' }, { d: 'M50 16 59 40h26L64 56l8 26-22-16-22 16 8-26L15 40h26Z', fill: '#FFC107' }],
  },
  {
    key: 'smiley-yellow', name: { en: 'Happy face', fr: 'Visage souriant', es: 'Cara feliz', it: 'Faccina felice', de: 'Lachendes Gesicht', nl: 'Blij gezicht', pl: 'Uśmiechnięta buźka' }, category: 'modern', stitchesAt30mm: 3400, sortOrder: 316, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#FFD600' }, { d: 'M30 40a5 8 0 1 0 10 0a5 8 0 1 0 -10 0ZM60 40a5 8 0 1 0 10 0a5 8 0 1 0 -10 0Z', fill: '#111111' }, { d: 'M26 58h48c-4 14-14 22-24 22S30 72 26 58Z', fill: '#111111' }, { d: 'M34 66h32c-4 6-10 10-16 10s-12-4-16-10Z', fill: '#FFFFFF' }],
  },
  {
    key: 'pizza', name: { en: 'Pizza', fr: 'Pizza', es: 'Pizza', it: 'Pizza', de: 'Pizza', nl: 'Pizza', pl: 'Pizza' }, category: 'food', stitchesAt30mm: 3600, sortOrder: 320, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M50 96 8 22c26-14 58-14 84 0Z',
    paths: [{ d: 'M50 96 8 22c26-14 58-14 84 0Z', fill: '#FFC93C' }, { d: 'M8 22c26-14 58-14 84 0l-4 8C66 18 34 18 12 30Z', fill: '#D9822B' }, { d: 'M33 44a7 7 0 1 0 14 0a7 7 0 1 0 -14 0ZM53 50a7 7 0 1 0 14 0a7 7 0 1 0 -14 0ZM44 68a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z', fill: '#E53935' }],
  },
  {
    key: 'avocado', name: { en: 'Avocado', fr: 'Avocat', es: 'Aguacate', it: 'Avocado', de: 'Avocado', nl: 'Avocado', pl: 'Awokado' }, category: 'food', stitchesAt30mm: 3800, sortOrder: 322, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M50 4c12 0 18 12 20 26 3 18 20 24 20 42a40 40 0 0 1-80 0c0-18 17-24 20-42C32 16 38 4 50 4Z',
    paths: [{ d: 'M50 4c12 0 18 12 20 26 3 18 20 24 20 42a40 40 0 0 1-80 0c0-18 17-24 20-42C32 16 38 4 50 4Z', fill: '#3E8E41' }, { d: 'M50 14c8 0 12 10 14 24 3 16 16 20 16 34a30 30 0 0 1-60 0c0-14 13-18 16-34C38 24 42 14 50 14Z', fill: '#B5E36B' }, { d: 'M37 70a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z', fill: '#7A4A1D' }],
  },
  {
    key: 'cactus', name: { en: 'Cactus', fr: 'Cactus', es: 'Cactus', it: 'Cactus', de: 'Kaktus', nl: 'Cactus', pl: 'Kaktus' }, category: 'nature', stitchesAt30mm: 3600, sortOrder: 324, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M50 10h0a8 8 0 0 1 8 8v42a8 8 0 0 1-8 8H50a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8Z',
    paths: [{ d: 'M50 10h0a8 8 0 0 1 8 8v42a8 8 0 0 1-8 8H50a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8ZM25 26h0a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5H25a5 5 0 0 1-5-5V31a5 5 0 0 1 5-5ZM20 46h24v8H20ZM75 18h0a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H75a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5ZM58 42h22v8H58Z', fill: '#3E8E41' }, { d: 'M30 70h40l-4 26H34Z', fill: '#D9822B' }, { d: 'M29 66h42a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H29a3 3 0 0 1-3-3V69a3 3 0 0 1 3-3Z', fill: '#B85C1E' }],
  },
  {
    key: 'palm', name: { en: 'Palm tree', fr: 'Palmier', es: 'Palmera', it: 'Palma', de: 'Palme', nl: 'Palmboom', pl: 'Palma' }, category: 'outdoors', stitchesAt30mm: 3600, sortOrder: 326, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M46 40h8l4 56H42Z',
    paths: [{ d: 'M46 40h8l4 56H42Z', fill: '#8B5A2B' }, { d: 'M50 40C30 26 14 30 6 44c14-4 26-2 44 2Zm0 0c20-14 36-10 44 4-14-4-26-2-44 2Zm0-2C40 20 26 14 12 20c10 4 20 10 30 22Zm0 0c10-18 24-24 38-18-10 4-20 10-30 22Zm0 0C44 22 44 10 50 2c6 8 6 20 2 36Z', fill: '#2E9E4F' }],
  },
  {
    key: 'coffee', name: { en: 'Coffee', fr: 'Café', es: 'Café', it: 'Caffè', de: 'Kaffee', nl: 'Koffie', pl: 'Kawa' }, category: 'food', stitchesAt30mm: 3600, sortOrder: 328, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M14 34h56v28a24 24 0 0 1-24 24H38a24 24 0 0 1-24-24Z',
    paths: [{ d: 'M14 34h56v28a24 24 0 0 1-24 24H38a24 24 0 0 1-24-24Z', fill: '#F2F4F7' }, { d: 'M70 40h8a12 12 0 0 1 0 24h-8v-8h8a4 4 0 0 0 0-8h-8Z', fill: '#F2F4F7' }, { d: 'M20 40h44v20a18 18 0 0 1-18 18H38a18 18 0 0 1-18-18Z', fill: '#6B3E1E' }, { d: 'M30 8c6 4 0 8 4 14M42 8c6 4 0 8 4 14M54 8c6 4 0 8 4 14', fill: '#B0B7C3' }, { d: 'M8 90h72v6H8Z', fill: '#B0B7C3' }],
  },
  {
    key: 'gamepad', name: { en: 'Gamepad', fr: 'Manette', es: 'Mando', it: 'Gamepad', de: 'Controller', nl: 'Controller', pl: 'Pad' }, category: 'modern', stitchesAt30mm: 3800, sortOrder: 330, colorCount: 6,
    viewBox: '0 0 100 100',
    path: 'M30 28h40c14 0 22 12 24 30l2 18a10 10 0 0 1-18 6L70 68H30l-8 14a10 10 0 0 1-18-6l2-18c2-18 10-30 24-30Z',
    paths: [{ d: 'M30 28h40c14 0 22 12 24 30l2 18a10 10 0 0 1-18 6L70 68H30l-8 14a10 10 0 0 1-18-6l2-18c2-18 10-30 24-30Z', fill: '#2F3542' }, { d: 'M28 40h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H28a2 2 0 0 1-2-2V42a2 2 0 0 1 2-2ZM22 46h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2V48a2 2 0 0 1 2-2Z', fill: '#F2F4F7' }, { d: 'M62 44a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#FFC107' }, { d: 'M72 52a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#F44336' }, { d: 'M62 60a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#4CAF50' }, { d: 'M52 52a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#2196F3' }],
  },
  {
    key: 'cherry', name: { en: 'Cherries', fr: 'Cerises', es: 'Cerezas', it: 'Ciliegie', de: 'Kirschen', nl: 'Kersen', pl: 'Wiśnie' }, category: 'food', stitchesAt30mm: 3600, sortOrder: 332, colorCount: 5,
    viewBox: '0 0 100 100',
    path: 'M16 74a18 18 0 1 0 36 0a18 18 0 1 0 -36 0Z',
    paths: [{ d: 'M36 62C40 40 52 24 70 10l4 6C58 30 48 44 44 64Zm28-2c2-20 8-34 14-46l6 2c-6 12-12 26-12 44Z', fill: '#2E9E4F' }, { d: 'M56 10c10-2 20 2 26 10-8 2-16 2-26-4Z', fill: '#4CAF50' }, { d: 'M16 74a18 18 0 1 0 36 0a18 18 0 1 0 -36 0Z', fill: '#E53935' }, { d: 'M52 72a16 16 0 1 0 32 0a16 16 0 1 0 -32 0Z', fill: '#C62828' }, { d: 'M24 68a4 3 0 1 0 8 0a4 3 0 1 0 -8 0ZM59 66a3 2 0 1 0 6 0a3 2 0 1 0 -6 0Z', fill: '#FFFFFF' }],
  },
  {
    key: 'watermelon', name: { en: 'Watermelon', fr: 'Pastèque', es: 'Sandía', it: 'Anguria', de: 'Wassermelone', nl: 'Watermeloen', pl: 'Arbuz' }, category: 'food', stitchesAt30mm: 3600, sortOrder: 334, colorCount: 4,
    viewBox: '0 0 100 100',
    path: 'M4 40a46 46 0 0 0 92 0Z',
    paths: [{ d: 'M4 40a46 46 0 0 0 92 0Z', fill: '#2E9E4F' }, { d: 'M12 40a38 38 0 0 0 76 0Z', fill: '#DFF5E1' }, { d: 'M18 40a32 32 0 0 0 64 0Z', fill: '#F44336' }, { d: 'M33 52a3 4 0 1 0 6 0a3 4 0 1 0 -6 0ZM47 62a3 4 0 1 0 6 0a3 4 0 1 0 -6 0ZM61 52a3 4 0 1 0 6 0a3 4 0 1 0 -6 0ZM47 46a3 4 0 1 0 6 0a3 4 0 1 0 -6 0Z', fill: '#111111' }],
  },
  {
    key: 'icecream', name: { en: 'Ice cream', fr: 'Glace', es: 'Helado', it: 'Gelato', de: 'Eis', nl: 'IJsje', pl: 'Lody' }, category: 'food', stitchesAt30mm: 3800, sortOrder: 336, colorCount: 6,
    viewBox: '0 0 100 100',
    path: 'M30 54h40L50 96Z',
    paths: [{ d: 'M30 54h40L50 96Z', fill: '#D9A066' }, { d: 'M34 60h32M38 68h24M42 76h16M46 84h8', fill: '#B8823F' }, { d: 'M30 40a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z', fill: '#FF80AB' }, { d: 'M24 30a14 14 0 1 0 28 0a14 14 0 1 0 -28 0Z', fill: '#FFFFFF' }, { d: 'M48 30a14 14 0 1 0 28 0a14 14 0 1 0 -28 0Z', fill: '#FFD54F' }, { d: 'M38 20a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z', fill: '#F44336' }],
  },
  {
    key: 'paper-plane', name: { en: 'Paper plane', fr: 'Avion en papier', es: 'Avión de papel', it: 'Aeroplanino', de: 'Papierflieger', nl: 'Papieren vliegtuig', pl: 'Papierowy samolot' }, category: 'modern', stitchesAt30mm: 2800, sortOrder: 338, colorCount: 2,
    viewBox: '0 0 100 100',
    path: 'M6 46 94 12 70 88 46 62Z',
    paths: [{ d: 'M6 46 94 12 70 88 46 62Z', fill: '#2196F3' }, { d: 'M46 62 94 12 38 52v26Z', fill: '#90CAF9' }],
  },
  {
    key: 'camera', name: { en: 'Camera', fr: 'Appareil photo', es: 'Cámara', it: 'Fotocamera', de: 'Kamera', nl: 'Camera', pl: 'Aparat' }, category: 'modern', stitchesAt30mm: 3600, sortOrder: 340, colorCount: 5,
    viewBox: '0 0 100 100',
    path: 'M12 30h18l6-10h28l6 10h18a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6Z',
    paths: [{ d: 'M12 30h18l6-10h28l6 10h18a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6Z', fill: '#2F3542' }, { d: 'M32 56a18 18 0 1 0 36 0a18 18 0 1 0 -36 0Z', fill: '#F2F4F7' }, { d: 'M39 56a11 11 0 1 0 22 0a11 11 0 1 0 -22 0Z', fill: '#2196F3' }, { d: 'M45 56a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z', fill: '#111111' }, { d: 'M76 40a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#F44336' }],
  },
  {
    key: 'crown-gold', name: { en: 'Gold crown', fr: 'Couronne dorée', es: 'Corona dorada', it: 'Corona d’oro', de: 'Goldkrone', nl: 'Gouden kroon', pl: 'Złota korona' }, category: 'shapes', stitchesAt30mm: 3600, sortOrder: 342, colorCount: 4,
    viewBox: '0 0 100 100',
    path: 'M10 76h80l8-46-24 16-14-28-14 28-24-16Z',
    paths: [{ d: 'M10 76h80l8-46-24 16-14-28-14 28-24-16Z', fill: '#FFC107' }, { d: 'M12 76h76a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V78a2 2 0 0 1 2-2Z', fill: '#D9822B' }, { d: 'M44 54a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z', fill: '#E53935' }, { d: 'M26 60a4 4 0 1 0 8 0a4 4 0 1 0 -8 0ZM66 60a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', fill: '#2196F3' }],
  },
  {
    key: 'diamond-blue', name: { en: 'Blue diamond', fr: 'Diamant bleu', es: 'Diamante azul', it: 'Diamante blu', de: 'Blauer Diamant', nl: 'Blauwe diamant', pl: 'Niebieski diament' }, category: 'shapes', stitchesAt30mm: 3600, sortOrder: 344, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M28 16h44l22 26-44 46L6 42Z',
    paths: [{ d: 'M28 16h44l22 26-44 46L6 42Z', fill: '#4FC3F7' }, { d: 'M28 16 6 42h20Zm44 0 22 26H74ZM26 42h48L50 88Z', fill: '#0288D1' }, { d: 'M40 16h20l-4 26H44Z', fill: '#B3E5FC' }],
  },
  {
    key: 'mountain-sun', name: { en: 'Mountains', fr: 'Montagnes', es: 'Montañas', it: 'Montagne', de: 'Berge', nl: 'Bergen', pl: 'Góry' }, category: 'outdoors', stitchesAt30mm: 3800, sortOrder: 346, colorCount: 5,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#E3F2FD' }, { d: 'M54 34a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z', fill: '#FFC107' }, { d: 'M6 78 36 32l18 26 10-14 30 34Z', fill: '#1E88E5' }, { d: 'M36 32l8 12-5 2-3-3-3 4-5-3Z', fill: '#FFFFFF' }, { d: 'M6 78h88v6a46 46 0 0 1-88 0Z', fill: '#2E9E4F' }],
  },
  {
    key: 'wave-badge', name: { en: 'Surf', fr: 'Surf', es: 'Surf', it: 'Surf', de: 'Surf', nl: 'Surf', pl: 'Surf' }, category: 'outdoors', stitchesAt30mm: 3600, sortOrder: 348, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z',
    paths: [{ d: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z', fill: '#0288D1' }, { d: 'M12 60c12-30 40-30 46-10 4-14 14-18 26-10-8 2-14 8-16 20-6-6-14-6-20 2 6-8 4-18-6-20-16-4-26 6-30 18Z', fill: '#FFFFFF' }, { d: 'M10 70c14-6 26-6 40 0s26 6 40 0v8c-14 6-26 6-40 0s-26-6-40 0Z', fill: '#B3E5FC' }],
  },
  {
    key: 'dino', name: { en: 'Dinosaur', fr: 'Dinosaure', es: 'Dinosaurio', it: 'Dinosauro', de: 'Dinosaurier', nl: 'Dinosaurus', pl: 'Dinozaur' }, category: 'animals', stitchesAt30mm: 3800, sortOrder: 350, colorCount: 3,
    viewBox: '0 0 100 100',
    path: 'M14 66c0-16 12-28 30-28h6c4-14 14-22 30-22 8 0 14 4 14 10 0 4-4 6-10 6h-8l-2 10c6 8 6 18-2 26-8 6-20 8-30 4l-4 10h-10l2-10C20 76 14 72 14 66Z',
    paths: [{ d: 'M14 66c0-16 12-28 30-28h6c4-14 14-22 30-22 8 0 14 4 14 10 0 4-4 6-10 6h-8l-2 10c6 8 6 18-2 26-8 6-20 8-30 4l-4 10h-10l2-10C20 76 14 72 14 66Z', fill: '#4CAF50' }, { d: 'M30 64c6-8 16-8 22 0v8c-6-6-16-6-22 0Z', fill: '#A5D6A7' }, { d: 'M69 24a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z', fill: '#111111' }],
  },
  {
    key: 'double-heart', name: { en: 'Two hearts', fr: 'Deux cœurs', es: 'Dos corazones', it: 'Due cuori', de: 'Zwei Herzen', nl: 'Twee harten', pl: 'Dwa serca' }, category: 'love', stitchesAt30mm: 2500, sortOrder: 12,
    viewBox: '0 0 100 100',
    path: 'M36 72 12 48a14 14 0 0 1 20-20l4 4 4-4a14 14 0 0 1 20 20Zm30 20L46 72a13 13 0 0 1 18-18l2 2 2-2a13 13 0 0 1 18 18Z',
  },
  {
    key: 'diamond', name: { en: 'Diamond', fr: 'Diamant', es: 'Diamante', it: 'Diamante', de: 'Diamant', nl: 'Diamant', pl: 'Diament' }, category: 'shapes', stitchesAt30mm: 2200, sortOrder: 32,
    viewBox: '0 0 100 100',
    path: 'M28 16h44l22 26-44 46L6 42Zm4 10-12 16h20l6-16Zm22 0-6 16h20l-6-16Zm20 0 6 16h20l-12-16ZM22 46l22 28-8-28Zm34 0-8 28 22-28Zm-16 0 10 32 10-32Z',
  },
  {
    key: 'shield', name: { en: 'Shield', fr: 'Bouclier', es: 'Escudo', it: 'Scudo', de: 'Schild', nl: 'Schild', pl: 'Tarcza' }, category: 'shapes', stitchesAt30mm: 2800, sortOrder: 34,
    viewBox: '0 0 100 100',
    path: 'M50 6 14 20v30c0 22 15 36 36 44 21-8 36-22 36-44V20Zm0 12 26 10v22c0 16-11 27-26 34-15-7-26-18-26-34V28Z',
  },
  {
    key: 'circle-badge', name: { en: 'Badge', fr: 'Badge', es: 'Insignia', it: 'Distintivo', de: 'Abzeichen', nl: 'Badge', pl: 'Odznaka' }, category: 'shapes', stitchesAt30mm: 2900, sortOrder: 36,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Zm0 12a34 34 0 1 0 0 68 34 34 0 0 0 0-68Zm0 10 6 14 15 2-11 10 3 15-13-8-13 8 3-15-11-10 15-2Z',
  },
  {
    key: 'butterfly', name: { en: 'Butterfly', fr: 'Papillon', es: 'Mariposa', it: 'Farfalla', de: 'Schmetterling', nl: 'Vlinder', pl: 'Motyl' }, category: 'animals', stitchesAt30mm: 2700, sortOrder: 42,
    viewBox: '0 0 100 100',
    path: 'M48 50C40 30 22 14 12 18S6 44 22 52C6 58 8 84 20 86s26-14 28-34Zm4 0c8-20 26-36 36-32s6 26-10 34c16 6 14 32 2 34s-26-14-28-34ZM47 46h6v34h-6Z',
  },
  {
    key: 'bird', name: { en: 'Bird', fr: 'Oiseau', es: 'Pájaro', it: 'Uccello', de: 'Vogel', nl: 'Vogel', pl: 'Ptak' }, category: 'animals', stitchesAt30mm: 2100, sortOrder: 44,
    viewBox: '0 0 100 100',
    path: 'M14 44c10-8 26-8 36 2 4-14 18-22 32-18l14 10-12 2c-2 18-18 30-36 30-8 0-14-2-20-6l-4 14-6-16C10 60 8 52 14 44Z',
  },
  {
    key: 'cat', name: { en: 'Cat', fr: 'Chat', es: 'Gato', it: 'Gatto', de: 'Katze', nl: 'Kat', pl: 'Kot' }, category: 'animals', stitchesAt30mm: 2400, sortOrder: 46,
    viewBox: '0 0 100 100',
    path: 'M22 18 40 32h20l18-14v30c0 20-16 34-36 34S6 68 6 48ZM32 46a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm32 0a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-16 12 6 8H42Z',
  },
  {
    key: 'sun', name: { en: 'Sun', fr: 'Soleil', es: 'Sol', it: 'Sole', de: 'Sonne', nl: 'Zon', pl: 'Słońce' }, category: 'outdoors', stitchesAt30mm: 2300, sortOrder: 52,
    viewBox: '0 0 100 100',
    path: 'M50 30a20 20 0 1 1 0 40 20 20 0 0 1 0-40Zm-4-26h8v16h-8Zm0 76h8v16h-8ZM4 46h16v8H4Zm76 0h16v8H80ZM17 23l6-6 11 11-6 6Zm49 49 6-6 11 11-6 6Zm0-38 11-11 6 6-11 11Zm-49 49 11-11 6 6-11 11Z',
  },
  {
    key: 'anchor', name: { en: 'Anchor', fr: 'Ancre', es: 'Ancla', it: 'Ancora', de: 'Anker', nl: 'Anker', pl: 'Kotwica' }, category: 'outdoors', stitchesAt30mm: 2400, sortOrder: 54,
    viewBox: '0 0 100 100',
    path: 'M50 6a11 11 0 0 1 4 21v9h16v8H54v36c12-2 22-10 26-22l-8 2 14-16 12 16-8-2C86 78 70 92 50 92S14 78 10 58l-8 2 12-16 14 16-8-2c4 12 14 20 26 22V44H30v-8h16v-9a11 11 0 0 1 4-21Zm0 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  },
  {
    key: 'tree', name: { en: 'Pine tree', fr: 'Sapin', es: 'Pino', it: 'Pino', de: 'Tanne', nl: 'Den', pl: 'Sosna' }, category: 'nature', stitchesAt30mm: 2200, sortOrder: 82,
    viewBox: '0 0 100 100',
    path: 'M50 4 30 34h10L22 60h12L16 84h28v12h12V84h28L66 60h12L60 34h10Z',
  },
  {
    key: 'leaf', name: { en: 'Leaf', fr: 'Feuille', es: 'Hoja', it: 'Foglia', de: 'Blatt', nl: 'Blad', pl: 'Liść' }, category: 'nature', stitchesAt30mm: 1900, sortOrder: 84,
    viewBox: '0 0 100 100',
    path: 'M88 12C50 10 18 34 14 74c20 6 46 0 62-22 8-12 12-26 12-40ZM20 88l40-44-4-4-40 44Z',
  },
  {
    key: 'clover', name: { en: 'Clover', fr: 'Trèfle', es: 'Trébol', it: 'Quadrifoglio', de: 'Kleeblatt', nl: 'Klaver', pl: 'Koniczyna' }, category: 'nature', stitchesAt30mm: 2400, sortOrder: 86,
    viewBox: '0 0 100 100',
    path: 'M50 48c-4-18-22-26-32-16s-4 28 14 32c-18 2-24 20-14 30s28 2 32-16c4 18 22 26 32 16s4-28-14-30c18-4 24-22 14-32S54 30 50 48Zm-4 4h8l6 40h-8Z',
  },
  {
    key: 'ball', name: { en: 'Football', fr: 'Ballon', es: 'Balón', it: 'Pallone', de: 'Fußball', nl: 'Voetbal', pl: 'Piłka' }, category: 'sport', stitchesAt30mm: 3000, sortOrder: 90,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Zm0 10a36 36 0 1 0 0 72 36 36 0 0 0 0-72Zm0 12 14 10-5 17H41l-5-17Zm-30 22 13 3 7 14-8 12-14-6Zm60 0 2 23-14 6-8-12 7-14ZM38 72h24l-2 12a36 36 0 0 1-20 0Z',
  },
  {
    key: 'trophy', name: { en: 'Trophy', fr: 'Trophée', es: 'Trofeo', it: 'Trofeo', de: 'Pokal', nl: 'Trofee', pl: 'Puchar' }, category: 'sport', stitchesAt30mm: 2600, sortOrder: 92,
    viewBox: '0 0 100 100',
    path: 'M26 8h48v8h16v12c0 14-10 24-22 26-3 6-8 10-14 12v10h14v10H32V76h14V66c-6-2-11-6-14-12C20 52 10 42 10 28V16h16Zm-8 16v4c0 8 5 14 12 16-2-6-4-12-4-20Zm64 0h-8c0 8-2 14-4 20 7-2 12-8 12-16Z',
  },
  {
    key: 'music-note', name: { en: 'Music note', fr: 'Note de musique', es: 'Nota musical', it: 'Nota musicale', de: 'Note', nl: 'Muzieknoot', pl: 'Nuta' }, category: 'symbols', stitchesAt30mm: 1800, sortOrder: 100,
    viewBox: '0 0 100 100',
    path: 'M40 8 78 4v14L50 22v48a16 12 0 1 1-10-11Z',
  },
  {
    key: 'smiley', name: { en: 'Smiley', fr: 'Smiley', es: 'Sonrisa', it: 'Faccina', de: 'Smiley', nl: 'Smiley', pl: 'Uśmiech' }, category: 'symbols', stitchesAt30mm: 2800, sortOrder: 102,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Zm0 10a36 36 0 1 0 0 72 36 36 0 0 0 0-72ZM34 34a6 8 0 1 1 0 16 6 8 0 0 1 0-16Zm32 0a6 8 0 1 1 0 16 6 8 0 0 1 0-16ZM26 58h48c-4 14-14 22-24 22S30 72 26 58Z',
  },
  {
    key: 'infinity', name: { en: 'Infinity', fr: 'Infini', es: 'Infinito', it: 'Infinito', de: 'Unendlich', nl: 'Oneindig', pl: 'Nieskończoność' }, category: 'symbols', stitchesAt30mm: 2000, sortOrder: 104,
    viewBox: '0 0 100 100',
    path: 'M26 30c12 0 18 8 24 16 6-8 12-16 24-16a20 20 0 0 1 0 40c-12 0-18-8-24-16-6 8-12 16-24 16a20 20 0 0 1 0-40Zm0 10a10 10 0 0 0 0 20c8 0 12-6 18-14-6-8-10-6-18-6Zm48 0c-8 0-12-2-18 6 6 8 10 14 18 14a10 10 0 0 0 0-20Z',
  },
  {
    key: 'peace', name: { en: 'Peace', fr: 'Paix', es: 'Paz', it: 'Pace', de: 'Frieden', nl: 'Vrede', pl: 'Pokój' }, category: 'symbols', stitchesAt30mm: 2500, sortOrder: 106,
    viewBox: '0 0 100 100',
    path: 'M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92Zm-4 10a36 36 0 0 0-32 36c0 6 2 12 4 16l28-20Zm8 0v32l28 20c2-4 4-10 4-16a36 36 0 0 0-32-36ZM24 76a36 36 0 0 0 22 10V62Zm52 0L54 62v24a36 36 0 0 0 22-10Z',
  },
  {
    key: 'heart', name: { en: 'Heart', fr: 'Cœur', es: 'Corazón', it: 'Cuore', de: 'Herz', nl: 'Hart', pl: 'Serce' }, category: 'love', stitchesAt30mm: 2100, sortOrder: 10,
    viewBox: '0 0 100 100',
    path: 'M50 88 L14 52a21 21 0 0 1 30-30l6 6 6-6a21 21 0 0 1 30 30Z',
  },
  {
    key: 'star', name: { en: 'Star', fr: 'Étoile', es: 'Estrella', it: 'Stella', de: 'Stern', nl: 'Ster', pl: 'Gwiazda' }, category: 'shapes', stitchesAt30mm: 1900, sortOrder: 20,
    viewBox: '0 0 100 100',
    path: 'M50 6 61 38h34L67 58l11 33-28-21-28 21 11-33L5 38h34Z',
  },
  {
    key: 'crown', name: { en: 'Crown', fr: 'Couronne', es: 'Corona', it: 'Corona', de: 'Krone', nl: 'Kroon', pl: 'Korona' }, category: 'shapes', stitchesAt30mm: 2400, sortOrder: 30,
    viewBox: '0 0 100 100',
    path: 'M10 72h80l8-44-24 16-14-28-14 28-24-16Z',
  },
  {
    key: 'paw', name: { en: 'Paw print', fr: 'Patte', es: 'Huella', it: 'Zampa', de: 'Pfote', nl: 'Pootafdruk', pl: 'Łapa' }, category: 'animals', stitchesAt30mm: 2300, sortOrder: 40,
    viewBox: '0 0 100 100',
    path: 'M50 56c14 0 26 10 26 20s-12 12-26 12-26-2-26-12 12-20 26-20ZM24 34a9 12 0 1 1 0 24 9 12 0 0 1 0-24Zm52 0a9 12 0 1 1 0 24 9 12 0 0 1 0-24ZM39 14a9 13 0 1 1 0 26 9 13 0 0 1 0-26Zm22 0a9 13 0 1 1 0 26 9 13 0 0 1 0-26Z',
  },
  {
    key: 'mountain', name: { en: 'Mountain', fr: 'Montagne', es: 'Montaña', it: 'Montagna', de: 'Berg', nl: 'Berg', pl: 'Góra' }, category: 'outdoors', stitchesAt30mm: 2000, sortOrder: 50,
    viewBox: '0 0 100 100',
    path: 'M6 82 38 26l18 30 10-14 28 40Z',
  },
  {
    key: 'wave', name: { en: 'Wave', fr: 'Vague', es: 'Ola', it: 'Onda', de: 'Welle', nl: 'Golf', pl: 'Fala' }, category: 'outdoors', stitchesAt30mm: 1800, sortOrder: 60,
    viewBox: '0 0 100 100',
    path: 'M4 62c12-18 24-18 36 0s24 18 36 0 16-12 20-6v28H4Z',
  },
  {
    key: 'bolt', name: { en: 'Lightning', fr: 'Éclair', es: 'Rayo', it: 'Fulmine', de: 'Blitz', nl: 'Bliksem', pl: 'Błyskawica' }, category: 'shapes', stitchesAt30mm: 1600, sortOrder: 70,
    viewBox: '0 0 100 100',
    path: 'M58 4 24 56h22l-8 40 36-56H52Z',
  },
  {
    key: 'flower', name: { en: 'Flower', fr: 'Fleur', es: 'Flor', it: 'Fiore', de: 'Blume', nl: 'Bloem', pl: 'Kwiat' }, category: 'nature', stitchesAt30mm: 2600, sortOrder: 80,
    viewBox: '0 0 100 100',
    path: 'M50 40a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0-32a16 16 0 0 1 0 32 16 16 0 0 1 0-32Zm0 52a16 16 0 0 1 0 32 16 16 0 0 1 0-32ZM8 50a16 16 0 0 1 32 0 16 16 0 0 1-32 0Zm52 0a16 16 0 0 1 32 0 16 16 0 0 1-32 0Z',
  },
];
