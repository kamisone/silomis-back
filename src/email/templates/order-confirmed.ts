import {
  baseLayout,
  ctaButton,
  divider,
  mutedText,
  esc,
  fmtCents,
} from './layout';
import { COPY, resolveLang } from './copy';
import { PickupPointEmailData, pickupPointBlock } from './pickup-point-block';

export interface OrderConfirmedEmailData {
  orderNumber: string;
  customerName: string;
  items: Array<{
    title: string;
    quantity: number;
    unitPriceCents: number;
    personalizations?: Array<{
      placementLabel: string;
      contentType: 'text' | 'monogram' | 'motif' | 'artwork';
      text: string;
      motifName: string | null;
      motifSizeMm: number | null;
      artworkName?: string | null;
      fontName: string;
      heightMm: number;
      threadNames: string[];
    }>;
  }>;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  couponCode: string | null;
  totalCents: number;
  trackingUrl: string | null;
  /** Present only for a pickup-point method — the customer's only record of which point they chose. */
  pickupPoint?: PickupPointEmailData | null;
  locale?: string | null;
}

/**
 * One embroidered position under its item. The text is set large and quoted
 * so it reads as *the thing being sewn* rather than as a product option — and
 * the spelling is the customer's to check here, before the needle moves.
 */
function embroideryLine(
  d: NonNullable<OrderConfirmedEmailData['items'][number]['personalizations']>[number],
  c: { embroidery: string; embroideryThread: string },
): string {
  const subject =
    d.contentType === 'artwork'
      ? esc(d.artworkName ?? '')
      : d.contentType === 'motif'
        ? esc(d.motifName ?? '')
        : `&ldquo;${esc(d.text).replace(/\n/g, '<br>')}&rdquo;`;
  const details = [esc(d.placementLabel)];
  if (d.contentType === 'artwork') {
    details.push(`${d.heightMm}&nbsp;mm`);
  } else if (d.contentType === 'motif') {
    if (d.motifSizeMm) details.push(`${d.motifSizeMm}&nbsp;mm`);
  } else {
    details.push(`${esc(d.fontName)} &middot; ${d.heightMm}&nbsp;mm`);
  }
  if (d.threadNames.length) details.push(`${c.embroideryThread} ${esc(d.threadNames.join(', '))}`);
  return `
        <div style="margin-top:6px;padding:8px 10px;border-left:3px solid #0d8f8c;background:#f0fafa;border-radius:0 6px 6px 0;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0d8f8c;">${c.embroidery}</div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;margin:2px 0;">${subject}</div>
          <div style="font-size:12px;color:#475569;">${details.join(' &middot; ')}</div>
        </div>`;
}

function summaryRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 12px;font-size:14px;color:#475569;">${label}</td>
      <td style="padding:6px 12px;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">${value}</td>
    </tr>`;
}

export function renderOrderConfirmed(data: OrderConfirmedEmailData): {
  subject: string;
  html: string;
} {
  const c = COPY[resolveLang(data.locale)].orderConfirmed;
  const subject = c.subject(data.orderNumber);

  const itemRows = data.items
    .map(
      (i) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">
        ${esc(i.title)}
        ${(i.personalizations ?? []).map((d) => embroideryLine(d, c)).join('')}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#475569;">${i.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#475569;">${fmtCents(i.unitPriceCents)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">${fmtCents(i.unitPriceCents * i.quantity)}</td>
    </tr>`,
    )
    .join('');

  const summaryRows: string[] = [];

  summaryRows.push(summaryRow(c.subtotal, fmtCents(data.subtotalCents)));

  if (data.shippingCents > 0) {
    summaryRows.push(summaryRow(c.shipping, fmtCents(data.shippingCents)));
  } else {
    summaryRows.push(
      summaryRow(
        c.shipping,
        `<span style="color:#16a34a;font-weight:600;">${c.freeShipping}</span>`,
      ),
    );
  }

  if (data.discountCents > 0) {
    const label = data.couponCode
      ? `${c.discountCode(esc(data.couponCode))}`
      : c.discount;
    summaryRows.push(
      summaryRow(
        label,
        `<span style="color:#dc2626;">-${fmtCents(data.discountCents)}</span>`,
      ),
    );
  }

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 20px;font-size:15px;">${c.intro}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 0;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colProduct}</th>
          <th style="text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colQty}</th>
          <th style="text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colPrice}</th>
          <th style="text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colTotal}</th>
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
              <td style="font-size:16px;font-weight:800;color:#0f172a;">${c.grandTotal}</td>
              <td style="font-size:16px;font-weight:800;color:#0f172a;text-align:right;">${fmtCents(data.totalCents)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${divider()}

    <p style="font-size:13px;color:#64748b;margin:0;">${c.orderRef} : <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong></p>

    ${data.pickupPoint ? pickupPointBlock(data.pickupPoint, data.locale) : ''}
    ${data.trackingUrl ? ctaButton(c.trackOrder, data.trackingUrl) : ''}
    ${mutedText(c.helpText)}
  `;

  return {
    subject,
    html: baseLayout(subject, body, data.locale),
  };
}
