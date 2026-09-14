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
 * How glyph stitches grow with letter height: stitches = base × (h / 10) ^ exp.
 *
 * Not 2. Doubling a letter's height quadruples the *thread* laid down, but a
 * satin column gets wider with the letter rather than adding stitches — each
 * zig-zag just spans more fabric — so the stitch *count* rises far slower than
 * the area. Digitised lettering lands around the 1.2–1.4 power in practice.
 * At 2 a six-letter name at 35mm was pushed past the top band, which is not a
 * quote-worthy job; at 1.3 it sits in the middle one.
 */
export const STITCH_HEIGHT_EXPONENT = 1.3;

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
 * How large a customer may make the embroidery area, in millimetres.
 *
 * The area is the customer's to size — it is the hoop the design is run in,
 * drawn on the photo at true scale, and they drag its edges to whatever suits
 * the words. The position's own field is only the starting size and the scale
 * of the photograph. These bounds are the machine's: a flat hoop of 300×200 is
 * as large a single run as the floor does, and below 15mm there is no room for
 * a stitch path to turn round.
 */
export const FIELD_MIN_MM = 15;
export const FIELD_MAX_WIDTH_MM = 300;
export const FIELD_MAX_HEIGHT_MM = 200;

/**
 * How many boxes one position may hold. Each box is its own words, face, size
 * and spool, placed on its own; six is more than a hoop the size of a cap
 * panel can carry legibly, and an unbounded list is a free way to make the
 * server resolve fonts all day.
 */
export const MAX_ELEMENTS = 6;

/** Up to three lines. Beyond that a hoop field runs out of height long before. */
export const MAX_TEXT_LINES = 3;

/**
 * Letter spacing, as a fraction of cap height.
 *
 * Tracking opens or closes every gap equally; kerning nudges one gap at a time.
 * Both exist because a digitiser does both — a script face needs its letters
 * touching, a block face on a curve needs them opened up, and "AV" needs
 * closing whatever the rest of the word wants.
 */
export const TRACKING_MIN = -0.12;
export const TRACKING_MAX = 0.5;
export const KERNING_LIMIT = 0.4;

/**
 * Arc the baseline is bent along, in degrees of the circle it sits on.
 *
 * Positive arches up over a cap's crown, negative smiles under it. Zero is a
 * straight line. Beyond about ±160 the ends meet and the word reads as a ring,
 * which is a real layout but not one to reach by accident.
 */
export const CURVE_LIMIT_DEG = 160;

/**
 * An outline is a second pass round every glyph in a second colour. It is not
 * free: the run length is roughly the perimeter, which on text is close to the
 * fill itself.
 */
export const OUTLINE_STITCH_FACTOR = 0.55;

/**
 * 3D puff lays foam under the satin and burns the edges off. Denser, slower,
 * and only possible on a bold flat face on a frame that can take the height —
 * both gated in the catalogue, never assumed.
 */
export const PUFF_STITCH_FACTOR = 1.35;

/** A curve costs travel between glyphs that a straight line does not. */
export const CURVE_STITCH_FACTOR = 1.08;

/** Motifs cost what they were digitised at, plus the usual colour changes. */
export const MOTIF_MIN_MM = 15;
export const MOTIF_MAX_MM = 120;

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
  TOO_MANY_LINES: 'PERSONALIZATION_TOO_MANY_LINES',
  TOO_TALL: 'PERSONALIZATION_TOO_TALL',
  MOTIF_UNKNOWN: 'PERSONALIZATION_MOTIF_UNKNOWN',
  MOTIF_SIZE: 'PERSONALIZATION_MOTIF_SIZE',
  PUFF_UNAVAILABLE: 'PERSONALIZATION_PUFF_UNAVAILABLE',
  CURVE_UNAVAILABLE: 'PERSONALIZATION_CURVE_UNAVAILABLE',
  OUTLINE_NEEDS_SECOND_COLOR: 'PERSONALIZATION_OUTLINE_NEEDS_SECOND_COLOR',
} as const;
