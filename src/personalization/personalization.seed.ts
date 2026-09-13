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
  minHeightMm: number;
  maxHeightMm: number;
  stitchesPerCharAt10mm: number;
  avgCharWidthRatio: number;
  uppercaseOnly: boolean;
  supportsMonogram: boolean;
  sortOrder: number;
}

/**
 * `webFamily` names faces the browser already has, plus a generic fallback.
 * The preview only has to carry the *character* of the stitched face — a
 * script reads as a script, a block face as a block face — and shipping eight
 * webfonts to every PDP visitor to be exact about it is a bad trade.
 */
export const FONT_SEED: FontSeed[] = [
  { key: 'block-classic', name: 'Block', webFamily: '"Helvetica Neue", Arial, sans-serif', minHeightMm: 8, maxHeightMm: 40, stitchesPerCharAt10mm: 130, avgCharWidthRatio: 0.62, uppercaseOnly: false, supportsMonogram: true, sortOrder: 10 },
  { key: 'block-bold', name: 'Block Bold', webFamily: '"Arial Black", "Helvetica Neue", sans-serif', minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 180, avgCharWidthRatio: 0.70, uppercaseOnly: false, supportsMonogram: true, sortOrder: 20 },
  { key: 'script-classic', name: 'Script', webFamily: '"Snell Roundhand", "Brush Script MT", cursive', minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 150, avgCharWidthRatio: 0.55, uppercaseOnly: false, supportsMonogram: true, sortOrder: 30 },
  { key: 'script-signature', name: 'Signature', webFamily: '"Zapfino", "Segoe Script", cursive', minHeightMm: 12, maxHeightMm: 40, stitchesPerCharAt10mm: 175, avgCharWidthRatio: 0.58, uppercaseOnly: false, supportsMonogram: false, sortOrder: 40 },
  { key: 'serif-varsity', name: 'Varsity', webFamily: '"Bookman Old Style", Georgia, serif', minHeightMm: 10, maxHeightMm: 40, stitchesPerCharAt10mm: 200, avgCharWidthRatio: 0.74, uppercaseOnly: true, supportsMonogram: true, sortOrder: 50 },
  { key: 'serif-classic', name: 'Serif', webFamily: 'Georgia, "Times New Roman", serif', minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 145, avgCharWidthRatio: 0.60, uppercaseOnly: false, supportsMonogram: true, sortOrder: 60 },
  { key: 'sans-modern', name: 'Modern', webFamily: '"Futura", "Century Gothic", sans-serif', minHeightMm: 8, maxHeightMm: 40, stitchesPerCharAt10mm: 125, avgCharWidthRatio: 0.64, uppercaseOnly: false, supportsMonogram: true, sortOrder: 70 },
  { key: 'mono-stencil', name: 'Stencil', webFamily: '"Courier New", ui-monospace, monospace', minHeightMm: 9, maxHeightMm: 40, stitchesPerCharAt10mm: 135, avgCharWidthRatio: 0.68, uppercaseOnly: true, supportsMonogram: false, sortOrder: 80 },
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
