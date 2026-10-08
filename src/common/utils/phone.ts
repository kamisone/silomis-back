/**
 * Phone numbers as customers type them, turned into something an SMS gateway
 * can dial and two lookups can compare.
 *
 * Checkout accepts a phone *instead of* an email, so a phone is now a contact
 * channel and a proof of ownership, not a note for the courier. That needs one
 * canonical form: "06 12 34 56 78" typed in France, "+33612345678" and
 * "0033 6 12 34 56 78" are the same customer.
 *
 * Deliberately not a full numbering-plan library: the national part is
 * checked for length only. A wrong-but-plausible number is caught the way a
 * mistyped email is — the message does not arrive.
 */

/** E.164 allows at most 15 digits; anything under 6 is not a reachable number anywhere we ship. */
const MIN_DIGITS = 6;
const MAX_DIGITS = 15;

/**
 * Countries whose national numbers keep their leading 0 after the country
 * code (Italian landlines: 06 … → +39 06 …). Everywhere else the 0 is a trunk
 * prefix and is dropped.
 */
const KEEPS_LEADING_ZERO = new Set(['+39', '+378', '+379']);

/** Spaces, dots, dashes, slashes and brackets — what people put between digit groups. */
function stripFormatting(raw: string): string {
  return raw.trim().replace(/[\s.\-/()]/g, '');
}

/** Whether `raw` has the shape of a phone number at all, before any country is known. */
export function isPlausiblePhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = stripFormatting(raw);
  if (!/^(\+|00)?\d+$/.test(s)) return false;
  const digits = s.replace(/^\+|^00/, '');
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS;
}

/**
 * `raw` in E.164 (`+33612345678`), or null when it cannot be made into one.
 *
 * An international number (`+…` or `00…`) is taken as-is. A national one
 * needs `dialPrefix` — the shipping country's, e.g. `+33` — and loses its
 * trunk 0. Without a prefix a national number cannot be placed and is null.
 */
export function toE164(raw: string | null | undefined, dialPrefix?: string | null): string | null {
  if (!raw || !isPlausiblePhone(raw)) return null;
  const s = stripFormatting(raw);

  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return `+${s.slice(2)}`;

  const prefix = dialPrefix?.trim().replace(/^00/, '+');
  if (!prefix || !/^\+\d{1,4}$/.test(prefix)) return null;

  const national = KEEPS_LEADING_ZERO.has(prefix) ? s : s.replace(/^0/, '');
  const full = `${prefix}${national}`;
  return full.length - 1 <= MAX_DIGITS ? full : null;
}

/**
 * Whether two numbers reach the same phone. Both sides are put through
 * `toE164` with the same country, so a customer can type the number on the
 * tracking page the way they typed it at checkout, or the other way round.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined, dialPrefix?: string | null): boolean {
  const left = toE164(a, dialPrefix);
  const right = toE164(b, dialPrefix);
  return !!left && left === right;
}
