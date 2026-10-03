import { COPY, resolveLang } from './copy';
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

// Silomis brand palette (front/src/app/globals.css) — teal primary, charcoal
// secondary, blush pink accent. Kept in sync manually since emails can't read
// CSS custom properties.
const BRAND_DARK = '#363a40'; // --color-secondary, neutral charcoal
const BRAND_PRIMARY = '#129c98'; // --color-primary, soft teal
const BRAND_MID = '#129c98'; // --color-primary, soft teal
const BRAND_ACCENT = '#d9548c'; // --color-accent, blush pink

/**
 * The shell every email is rendered into.
 *
 * ── On the header lockup ──────────────────────────────────────────────────
 * Deliberately NOT the website's arrangement. There the mark IS the capital S
 * and the word beside it is "ilomis" set in Pacifico — a trick that needs both
 * a loaded script font and a loaded image, and email guarantees neither. A
 * client that blocks images (most, by default, on first contact) or cannot load
 * a webfont (Gmail, Outlook) would render the brand as "ilomis", which reads as
 * a misspelling of it. So here the word is spelled in full, in a stack every
 * client has, and the mark sits beside it rather than inside it: the same three
 * elements — mark, name, what the shop does — in an arrangement that cannot
 * break.
 *
 * The lockup is a table, not inline-flex: Outlook's Word renderer supports
 * neither flex nor vertical-align on an inline box, and would stack the mark
 * above the name. The mark's `alt` is empty because the name is beside it in
 * text — a blocked image must not make the header say the brand twice. The
 * stitch rule under the name is a dashed border, the one way to draw a dashed
 * line that Outlook also renders.
 *
 * ── On the preheader ─────────────────────────────────────────────────────
 * The line a client prints after the subject in the inbox list. Without one it
 * takes whatever text comes first, which for every email here was "Hello
 * <name>," — a preview that says nothing in the one place a recipient decides
 * whether to open. It is hidden four ways, because clients honour different
 * ones: zero size and height, display:none, and zero opacity. The run of
 * zero-width spaces after it stops Gmail pulling the following text in to pad
 * the preview out.
 *
 * ── On comments ──────────────────────────────────────────────────────────
 * Everything above is here rather than inside the returned HTML, where it used
 * to be: an HTML comment is mailed to the recipient. 2.1KB of developer prose
 * was travelling with every message — 41% of the rendered shell — for nobody to
 * read. Only the `[if mso]` block below survives, because that one is
 * functional: it is how Outlook is told its own pixel density.
 */
export function baseLayout(
  title: string,
  body: string,
  locale?: string | null,
  preheader?: string,
): string {
  const year = new Date().getFullYear();
  const seller = esc(process.env.SELLER_NAME ?? 'Silomis');
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const lang = resolveLang(locale);
  const footer = COPY[lang].footer(year, seller);
  // An absolute URL, because an email has no page to be relative to. Falls back
  // to the mark served by the storefront, so the lockup appears without anyone
  // having to set anything — and can still be pointed elsewhere if the asset
  // moves to a CDN.
  const logoUrl =
    process.env.EMAIL_LOGO_URL?.trim() ||
    (appUrl ? `${appUrl}/assets/logo-email.png` : '');
  const tagline = COPY[lang].tagline;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${esc(title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${
    preheader
      ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(27,73,101,0.12);">

        <tr>
          <td style="background:linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_PRIMARY} 100%);padding:24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  ${appUrl ? `<a href="${esc(appUrl)}" style="text-decoration:none;">` : ''}
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      ${
                        logoUrl
                          ? `<td style="padding-right:11px;vertical-align:middle;" width="32">
                        <img src="${esc(logoUrl)}" alt="" width="32" height="38" style="display:block;border:0;outline:none;text-decoration:none;" />
                      </td>`
                          : ''
                      }
                      <td style="vertical-align:middle;">
                        <div style="color:#ffffff;font-size:21px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">${seller}</div>
                        <div style="border-top:2px dashed rgba(255,255,255,0.55);margin-top:5px;padding-top:4px;">
                          <span style="color:rgba(255,255,255,0.86);font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${esc(tagline)}</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                  ${appUrl ? '</a>' : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td style="height:3px;background:${BRAND_ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr>
          <td style="padding:32px 32px 28px;font-size:15px;line-height:1.65;color:#1e293b;">
            ${body}
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#94a3b8;line-height:1.5;">
                  ${footer}
                </td>
                ${
                  appUrl
                    ? `<td style="text-align:right;vertical-align:middle;">
                  <a href="${appUrl}" style="color:${BRAND_MID};font-size:12px;font-weight:600;text-decoration:none;">${seller}</a>
                </td>`
                    : ''
                }
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

export function ctaButton(
  label: string,
  href: string,
  color = BRAND_PRIMARY,
): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="background:${color};border-radius:8px;">
          <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.01em;">${esc(label)}</a>
        </td>
      </tr>
    </table>`;
}

export function divider(): string {
  return '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">';
}

export function mutedText(text: string): string {
  return `<p style="font-size:13px;color:#64748b;line-height:1.55;">${text}</p>`;
}
