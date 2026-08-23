export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

// Silomis brand palette (front/src/app/globals.css)
const BRAND_DARK = '#1b4965'; // --brand-900, deep navy
const BRAND_PRIMARY = '#1b4965'; // --brand-900
const BRAND_MID = '#5fa8d3'; // --brand-600, mid blue
const BRAND_ACCENT = '#62b6cb'; // --brand-500, teal-blue

export function baseLayout(title: string, body: string): string {
  const year = new Date().getFullYear();
  const seller = esc(process.env.SELLER_NAME ?? 'Silomis');
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const footer = `© ${year} ${seller}. All rights reserved.`;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${esc(title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:32px 16px;">

      <!-- Main card -->
      <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(27,73,101,0.12);">

        <!-- Header bar -->
        <tr>
          <td style="background:linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_PRIMARY} 100%);padding:24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  ${appUrl ? `<a href="${appUrl}" style="text-decoration:none;display:inline-flex;align-items:center;">` : ''}
                  <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;vertical-align:middle;">${seller}</span>
                  ${appUrl ? '</a>' : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Accent stripe -->
        <tr><td style="height:3px;background:${BRAND_ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body content -->
        <tr>
          <td style="padding:32px 32px 28px;font-size:15px;line-height:1.65;color:#1e293b;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#94a3b8;line-height:1.5;">
                  ${footer}
                </td>
                ${appUrl ? `<td style="text-align:right;vertical-align:middle;">
                  <a href="${appUrl}" style="color:${BRAND_MID};font-size:12px;font-weight:600;text-decoration:none;">${seller}</a>
                </td>` : ''}
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

export function ctaButton(label: string, href: string, color = BRAND_PRIMARY): string {
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
