/**
 * Classifies a visitor's first-touch acquisition channel from an explicit
 * `utm_source` campaign tag (wins when present) or the referrer captured at
 * landing (front/src/lib/shop/trafficSource.ts). Null when there's nothing to
 * classify — never a guessed "direct".
 *
 * The request's own Referer header is deliberately not an input: on an
 * in-app fetch it is always the storefront page that made the call (or is
 * stripped by the proxy), never the external site the visitor came from.
 */

const UTM_SOURCE_MAP: Record<string, string> = {
  instagram: 'Instagram',
  ig: 'Instagram',
  facebook: 'Facebook',
  fb: 'Facebook',
  tiktok: 'TikTok',
  google: 'Google',
  youtube: 'YouTube',
  twitter: 'X',
  x: 'X',
  pinterest: 'Pinterest',
  whatsapp: 'WhatsApp',
  snapchat: 'Snapchat',
  newsletter: 'Newsletter',
  email: 'Email',
};

const HOST_PATTERNS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)facebook\.com$/i, 'Facebook'],
  [/(^|\.)fb\.com$/i, 'Facebook'],
  [/(^|\.)fb\.me$/i, 'Facebook'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)google\.[a-z.]+$/i, 'Google'],
  [/(^|\.)youtube\.com$/i, 'YouTube'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/i, 'X'],
  [/(^|\.)pinterest\.[a-z.]+$/i, 'Pinterest'],
  [/(^|\.)whatsapp\.com$/i, 'WhatsApp'],
  [/(^|\.)snapchat\.com$/i, 'Snapchat'],
];

/**
 * An unrecognized utm_source is surfaced verbatim, since it's a label the
 * admin chose themselves. A present-but-unmatched referrer reports as 'Other'
 * to keep "we know nothing" (null) distinct from "not one of these" (Other).
 */
export function platformFromSource(referrer?: string | null, utmSource?: string | null): string | null {
  if (utmSource?.trim()) {
    const key = utmSource.trim().toLowerCase();
    return UTM_SOURCE_MAP[key] ?? utmSource.trim().slice(0, 30);
  }

  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname;
    for (const [pattern, label] of HOST_PATTERNS) {
      if (pattern.test(host)) return label;
    }
    return 'Other';
  } catch {
    return null;
  }
}
