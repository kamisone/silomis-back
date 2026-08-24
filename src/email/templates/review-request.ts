import { baseLayout, ctaButton, mutedText, esc } from './layout';
import { COPY, resolveLang } from './copy';

export interface ReviewRequestEmailData {
  customerName: string;
  orderNumber: string;
  productTitle: string;
  reviewUrl: string;
  locale?: string | null;
}

export function renderReviewRequest(data: ReviewRequestEmailData): {
  subject: string;
  html: string;
} {
  const c = COPY[resolveLang(data.locale)].reviewRequest;
  const subject = c.subject(data.productTitle);

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 16px;font-size:15px;">${c.intro(esc(data.orderNumber), esc(data.productTitle))}</p>
    <p style="margin:0 0 8px;font-size:15px;">${c.body}</p>
    ${ctaButton(c.cta, data.reviewUrl)}
    ${mutedText(`${c.fallback} ${esc(data.reviewUrl)}`)}
  `;

  return { subject, html: baseLayout(subject, body) };
}
