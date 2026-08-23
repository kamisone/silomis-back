import { baseLayout, ctaButton, divider, mutedText, esc, fmtCents } from './layout';

export interface OrderConfirmedEmailData {
  orderNumber: string;
  customerName: string;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  couponCode: string | null;
  totalCents: number;
  trackingUrl: string | null;
}

function summaryRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 12px;font-size:14px;color:#475569;">${label}</td>
      <td style="padding:6px 12px;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">${value}</td>
    </tr>`;
}

export function renderOrderConfirmed(data: OrderConfirmedEmailData): { subject: string; html: string } {
  const subject = `Order confirmed – ${data.orderNumber}`;

  const itemRows = data.items
    .map(
      (i) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">${esc(i.title)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#475569;">${i.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#475569;">${fmtCents(i.unitPriceCents)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">${fmtCents(i.unitPriceCents * i.quantity)}</td>
    </tr>`,
    )
    .join('');

  const summaryRows: string[] = [];

  summaryRows.push(summaryRow('Subtotal', fmtCents(data.subtotalCents)));

  if (data.shippingCents > 0) {
    summaryRows.push(summaryRow('Shipping', fmtCents(data.shippingCents)));
  } else {
    summaryRows.push(summaryRow('Shipping', '<span style="color:#16a34a;font-weight:600;">Free</span>'));
  }

  if (data.discountCents > 0) {
    const label = data.couponCode
      ? `Discount <span style="font-size:12px;color:#64748b;">(code: ${esc(data.couponCode)})</span>`
      : 'Discount';
    summaryRows.push(summaryRow(label, `<span style="color:#dc2626;">-${fmtCents(data.discountCents)}</span>`));
  }

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">Hello ${esc(data.customerName)},</p>
    <p style="margin:0 0 20px;font-size:15px;">Thanks for your order! We've received it and will start processing it shortly.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 0;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">Product</th>
          <th style="text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">Qty</th>
          <th style="text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">Unit price</th>
          <th style="text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- Price breakdown -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0 0;">
      ${summaryRows.join('')}
      <tr>
        <td colspan="2" style="padding:12px 12px 0;border-top:2px solid #e2e8f0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:16px;font-weight:800;color:#0f172a;">Total</td>
              <td style="font-size:16px;font-weight:800;color:#0f172a;text-align:right;">${fmtCents(data.totalCents)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${divider()}

    <p style="font-size:13px;color:#64748b;margin:0;">Order reference : <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong></p>

    ${data.trackingUrl ? ctaButton('Track my order', data.trackingUrl) : ''}
    ${mutedText('If you have any questions, feel free to reach out to our support team.')}
  `;

  return {
    subject,
    html: baseLayout(subject, body),
  };
}
