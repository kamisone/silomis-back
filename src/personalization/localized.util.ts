/**
 * A field written once per language, stored as a JSON map.
 *
 * Used instead of the translations table for admin-authored copy that belongs
 * to the row itself — a placement's name is not an overlay on a base language,
 * it IS the row, and there is nothing sensible to fall back to if the map is
 * empty. It also lets the admin's Generate button fill six languages from one
 * without a second round trip to a translations service.
 */
export type LocalizedText = Record<string, string>;

export const DEFAULT_LOCALE = 'en';

/** Rejects a value that is not a plain object of non-empty strings. */
export function parseLocalized(value: unknown): LocalizedText | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: LocalizedText = {};
  for (const [locale, text] of Object.entries(value as Record<string, unknown>)) {
    if (typeof text === 'string' && text.trim()) out[locale] = text.trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The best available string for a language.
 *
 * Falls through to the default locale and then to whatever exists, because an
 * admin who has written only French should still see their own text rather
 * than an empty label — the alternative is a blank button in the editor.
 */
export function pickLocalized(value: unknown, lang?: string): string {
  const map = parseLocalized(value);
  if (!map) return '';
  return (lang && map[lang]) || map[DEFAULT_LOCALE] || Object.values(map)[0] || '';
}
