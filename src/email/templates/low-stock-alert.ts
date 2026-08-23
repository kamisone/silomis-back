import { baseLayout, ctaButton, divider, esc } from './layout';

export interface LowStockAlertEmailData {
  productTitle: string;
  variantTitle: string | null;
  available: number;
  lowStockThreshold: number;
}

export function renderLowStockAlert(data: LowStockAlertEmailData): { subject: string; html: string } {
  const subject = `Low stock alert – ${data.productTitle}`;
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const inventoryUrl = `${appUrl}/admin/shop/inventory`;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">Hello,</p>
    <p style="margin:0 0 20px;font-size:15px;">One of your products is running low on stock and may need restocking soon.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0;background:#f8fafc;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;font-size:14px;color:#475569;">Product</td>
        <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;">${esc(data.productTitle)}${data.variantTitle ? ` <span style="font-weight:400;color:#64748b;">(${esc(data.variantTitle)})</span>` : ''}</td>
      </tr>
      <tr>
        <td style="padding:0 16px 14px;font-size:14px;color:#475569;">Available stock</td>
        <td style="padding:0 16px 14px;font-size:14px;font-weight:700;color:#dc2626;text-align:right;">${data.available}</td>
      </tr>
      <tr>
        <td style="padding:0 16px 14px;font-size:14px;color:#475569;">Low stock threshold</td>
        <td style="padding:0 16px 14px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;">${data.lowStockThreshold}</td>
      </tr>
    </table>

    ${divider()}
    ${ctaButton('View inventory', inventoryUrl)}
  `;

  return {
    subject,
    html: baseLayout(subject, body),
  };
}
