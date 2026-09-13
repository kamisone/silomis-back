import { z } from 'zod';

/**
 * What the browser is allowed to say about a design.
 *
 * Note what is absent: no price, no stitch count, no rendered artwork. Those
 * are all derived server-side in PersonalizationService — the editor computes
 * them too, but only so it can show a live figure, and the two are compared
 * again at checkout.
 */
export const PersonalizationInputSchema = z.object({
  placementKey: z.string().min(1).max(60),
  contentType: z.enum(['text', 'monogram']),
  /** Raw as typed; the service trims, collapses and cases it. */
  text: z.string().min(1).max(60),
  fontKey: z.string().min(1).max(80),
  /** Cap height. Bounded again against the font and the placement. */
  heightMm: z.number().min(1).max(200),
  /** ThreadColor ids, in the order they are used. */
  threadColorIds: z.array(z.string().uuid()).min(1).max(6),
  /** How heavy the lettering is stitched, 1 (light) to 5 (extra bold). */
  weight: z.number().int().min(1).max(5).optional(),
  /**
   * How far the customer moved the hoop from the position's traced centre, in
   * millimetres.
   *
   * The bound here is only a sanity rail against absurd input — the real limit
   * is MAX_TRAVEL_FACTOR × the placement's own field, applied in the service,
   * which is the only thing that knows how big the position is. It has to stay
   * well clear of any plausible field, because a value the schema rejects is a
   * 400 the customer sees, while one the service clamps is a drag that simply
   * stops at the edge.
   */
  offsetXMm: z.number().min(-2000).max(2000).optional(),
  offsetYMm: z.number().min(-2000).max(2000).optional(),
  /**
   * Angle of the embroidery in the garment's own plane, in degrees.
   *
   * Deliberately not capped at ±360: a rotate handle accumulates, and dragging
   * twice round is an ordinary gesture that would otherwise come back as a 400.
   * The service folds any angle into a single turn — the rail here only exists
   * to reject something that is not a rotation at all.
   */
  rotationDeg: z.number().min(-100000).max(100000).optional(),
});

export type PersonalizationInput = z.infer<typeof PersonalizationInputSchema>;

/**
 * A customer can embroider several positions on one item — a name on the front
 * and initials on the back strap — and pays for each. Capped at six because
 * that is more positions than any headwear actually has, and an unbounded list
 * is a free way to make the server resolve fonts and threads all day.
 */
export const PersonalizationSetSchema = z
  .array(PersonalizationInputSchema)
  .min(1)
  .max(6)
  .refine(
    (designs) => new Set(designs.map((d) => d.placementKey)).size === designs.length,
    { message: 'Each position can carry only one design.' },
  );

/** Add-to-cart body — personalisation is optional, so a plain add is unchanged. */
export const AddCartItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
  selectedOptionValueIds: z.array(z.string()).optional(),
  personalizations: PersonalizationSetSchema.optional(),
});

export type AddCartItemDto = z.infer<typeof AddCartItemSchema>;

/**
 * Live quote for the whole set, used by the editor on every edit (debounced).
 * The whole set rather than one design at a time, so the figure the customer
 * is shown is the server's own total and not a sum the browser assembled.
 */
export const QuotePersonalizationSchema = z.object({
  designs: PersonalizationSetSchema,
});

export type QuotePersonalizationDto = z.infer<typeof QuotePersonalizationSchema>;
