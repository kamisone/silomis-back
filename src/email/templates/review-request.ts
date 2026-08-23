import { baseLayout, ctaButton, mutedText, esc } from './layout';

export interface ReviewRequestEmailData {
  customerName: string;
  orderNumber: string;
  productTitle: string;
  reviewUrl: string;
}

export function renderReviewRequest(data: ReviewRequestEmailData): {
  subject: string;
  html: string;
} {
  const subject = `How was your ${data.productTitle}?`;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">Hello ${esc(data.customerName)},</p>
    <p style="margin:0 0 16px;font-size:15px;">Your order <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong> has been delivered. We'd love to hear what you think about <strong style="color:#0f172a;">${esc(data.productTitle)}</strong>.</p>
    <p style="margin:0 0 8px;font-size:15px;">Your review helps other shoppers make better choices.</p>
    ${ctaButton('Write a review', data.reviewUrl)}
    ${mutedText(`Or copy this link into your browser: ${esc(data.reviewUrl)}`)}
  `;

  return { subject, html: baseLayout(subject, body) };
}
