import { baseLayout, ctaButton, mutedText, esc } from './layout';
import { COPY, resolveLang } from './copy';

export interface PaymentFailedEmailData {
  orderNumber: string;
  customerName: string;
  retryUrl: string | null;
  locale?: string | null;
}

export function renderPaymentFailed(data: PaymentFailedEmailData): {
  subject: string;
  html: string;
} {
  const c = COPY[resolveLang(data.locale)].paymentFailed;
  const subject = c.subject(data.orderNumber);

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 20px;font-size:15px;">${c.intro}</p>
    <p style="font-size:13px;color:#64748b;margin:0;">${c.orderRef} : <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong></p>
    ${data.retryUrl ? ctaButton(c.cta, data.retryUrl) : ''}
    ${mutedText(c.note)}
  `;

  return { subject, html: baseLayout(subject, body) };
}
