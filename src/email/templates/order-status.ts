import { baseLayout, ctaButton, mutedText, esc } from './layout';
import { COPY, resolveLang } from './copy';

export type OrderStatusKind =
  'preparing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderStatusEmailData {
  orderNumber: string;
  customerName: string;
  trackingUrl: string | null;
  locale?: string | null;
}

export function renderOrderStatus(
  kind: OrderStatusKind,
  data: OrderStatusEmailData,
): { subject: string; html: string } {
  const c = COPY[resolveLang(data.locale)].orderStatus;
  const copy = c[kind];
  const subject = `Order ${data.orderNumber} ${copy.subjectSuffix}`;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">Hello ${esc(data.customerName)},</p>
    <p style="margin:0 0 20px;font-size:15px;">${copy.message}</p>
    <p style="font-size:13px;color:#64748b;margin:0;">${c.orderRef} : <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong></p>
    ${data.trackingUrl ? ctaButton(c.trackOrder, data.trackingUrl) : ''}
    ${mutedText(c.helpText)}
  `;

  return { subject, html: baseLayout(copy.heading, body) };
}
