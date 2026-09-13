/**
 * Fixed rules of the embroidery domain. These are not admin settings: they
 * describe what a machine and a thread will physically do, so a shop that
 * changed them would just be lying to itself about what it can sew.
 */

/**
 * Characters a text embroidery face can actually stitch. Latin letters with
 * the accents our seven locales use, digits, and the handful of punctuation
 * marks that exist as glyphs in a digitised face.
 *
 * Emoji and other scripts are excluded deliberately rather than stripped: a
 * customer who typed one has to see that it cannot be sewn, because silently
 * dropping it would ship a cap that is missing the part they cared about.
 */
export const STITCHABLE_TEXT = /^[A-Za-zÀ-ÖØ-öø-ÿŁłŃńŚśŹźŻżĄąĆćĘęÓó0-9 '&.\-]+$/u;

/** Monograms are letters only — a "." between two initials is a period, not a glyph. */
export const STITCHABLE_MONOGRAM = /^[A-Za-zÀ-ÖØ-öø-ÿŁłŃńŚśŹźŻżĄąĆćĘęÓó]+$/u;

export const MONOGRAM_MIN_CHARS = 2;
export const MONOGRAM_MAX_CHARS = 3;

/**
 * A monogram is drawn larger and more densely than the same letters set as
 * text — interlocked, usually with a decorative frame — so its stitch count
 * runs well above a plain three-letter word.
 */
export const MONOGRAM_STITCH_FACTOR = 1.45;

/**
 * Every colour change costs a trim, a tie-off and a re-tie. Flat per-colour
 * overhead, added on top of the glyph stitches.
 */
export const STITCHES_PER_COLOR_CHANGE = 120;

/** Underlay and travel stitches that exist in every job regardless of size. */
export const STITCH_BASE_OVERHEAD = 80;

/**
 * How heavy the lettering is stitched.
 *
 * Not a second digitised face — a satin column can be laid down thicker or
 * thinner from the same outline, which is what an embroiderer means by a bolder
 * letter. So it applies to every font rather than being a property of one.
 *
 * `stitchFactor` is the honest consequence: a thicker column is more thread and
 * more machine time, so a bold design costs more, and can push a large one past
 * the top price band. `widthFactor` is much smaller — the column grows mostly
 * inward, and the advance barely moves.
 */
export const WEIGHT_SCALE = [
  { step: 1, cssWeight: 300, stitchFactor: 0.82, widthFactor: 0.97 },
  { step: 2, cssWeight: 400, stitchFactor: 1.0, widthFactor: 1.0 },
  { step: 3, cssWeight: 500, stitchFactor: 1.18, widthFactor: 1.02 },
  { step: 4, cssWeight: 700, stitchFactor: 1.42, widthFactor: 1.05 },
  { step: 5, cssWeight: 900, stitchFactor: 1.72, widthFactor: 1.09 },
] as const;

export const DEFAULT_WEIGHT_STEP = 2;

export function weightForStep(step: number | undefined) {
  return WEIGHT_SCALE.find((w) => w.step === step) ?? WEIGHT_SCALE[DEFAULT_WEIGHT_STEP - 1];
}

/**
 * How far the design may be moved from the position's traced centre, as a
 * multiple of the hoop field's own size.
 *
 * The whole field travels with it — outline and lettering together — because a
 * design nudged outside its own hoop is not a design, it is a re-hooping. 1.5
 * lets a customer place lettering anywhere over the panel the photograph shows
 * while keeping the request bounded; the shop is still the one deciding, per
 * position, whether its frame can reach there.
 */
export const MAX_TRAVEL_FACTOR = 1.5;

/**
 * Rotation is unrestricted: a machine sews a stitch path at whatever angle the
 * file specifies, and a cap's peak, a beanie's cuff and a bag's corner all want
 * different ones. The only thing that has to be bounded is how far the design
 * travels, which MAX_TRAVEL_FACTOR already handles.
 *
 * Stored to a tenth of a degree — finer than that is below what anyone can aim
 * with a pointer, and it would make two visually identical designs hash apart.
 */
export const ROTATION_LIMIT_DEG = 180;

/**
 * Words we will not stitch. Deliberately short and obvious: this is a backstop
 * against the worst inputs reaching a machine unattended, not a moderation
 * system — anything subtler is a job for the production queue, where a person
 * sees the text before it is sewn.
 */
export const BLOCKED_TEXT_PATTERNS: RegExp[] = [
  /\bf+u+c+k+/i,
  /\bs+h+i+t+/i,
  /\bc+u+n+t+/i,
  /\bn+i+g+g+[ae]r/i,
  /\bf+a+g+g+o+t/i,
  /\bb+i+t+c+h+/i,
  /\bwhore\b/i,
  /\bnazi\b/i,
  /\bhitler\b/i,
  /\bheil\b/i,
];

/**
 * Error codes the storefront maps to its own translated copy. The backend's
 * English message is a developer-facing fallback — a customer never sees it,
 * exactly like the stock and price errors the cart already returns.
 */
export const PERSONALIZATION_ERRORS = {
  NOT_AVAILABLE: 'PERSONALIZATION_NOT_AVAILABLE',
  PLACEMENT_UNKNOWN: 'PERSONALIZATION_PLACEMENT_UNKNOWN',
  FONT_UNKNOWN: 'PERSONALIZATION_FONT_UNKNOWN',
  THREAD_UNKNOWN: 'PERSONALIZATION_THREAD_UNKNOWN',
  TEXT_EMPTY: 'PERSONALIZATION_TEXT_EMPTY',
  TEXT_TOO_LONG: 'PERSONALIZATION_TEXT_TOO_LONG',
  TEXT_UNSTITCHABLE: 'PERSONALIZATION_TEXT_UNSTITCHABLE',
  TEXT_BLOCKED: 'PERSONALIZATION_TEXT_BLOCKED',
  MONOGRAM_LENGTH: 'PERSONALIZATION_MONOGRAM_LENGTH',
  HEIGHT_OUT_OF_RANGE: 'PERSONALIZATION_HEIGHT_OUT_OF_RANGE',
  TOO_WIDE: 'PERSONALIZATION_TOO_WIDE',
  TOO_MANY_COLORS: 'PERSONALIZATION_TOO_MANY_COLORS',
  TOO_MANY_STITCHES: 'PERSONALIZATION_TOO_MANY_STITCHES',
  CONTENT_TYPE_DISABLED: 'PERSONALIZATION_CONTENT_TYPE_DISABLED',
} as const;
