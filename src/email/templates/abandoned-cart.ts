import { baseLayout, ctaButton, mutedText, esc, fmtCents } from './layout';

export interface AbandonedCartEmailData {
  customerName: string;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
  resumeUrl: string;
}

export function renderAbandonedCart(data: AbandonedCartEmailData): { subject: string; html: string } {
  const subject = 'You left something in your cart';

  const itemList = data.items
    .map(
      (i) =>
        `<li style="padding:6px 0;font-size:14px;color:#334155;">${esc(i.title)} × ${i.quantity} — <strong>${fmtCents(i.unitPriceCents * i.quantity)}</strong></li>`,
    )
    .join('');

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">Hello ${esc(data.customerName)},</p>
    <p style="margin:0 0 16px;font-size:15px;">You still have items waiting in your cart. Complete your order before they sell out.</p>
    <ul style="margin:0 0 8px;padding-left:20px;">${itemList}</ul>
    ${ctaButton('Complete my order', data.resumeUrl)}
    ${mutedText("If you've already completed your purchase, you can safely ignore this email.")}
  `;

  return {
    subject,
    html: baseLayout(subject, body),
  };
}
