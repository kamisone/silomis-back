import { baseLayout, ctaButton, esc } from './layout';

export interface BackInStockEmailData {
  productTitle: string;
  productUrl: string;
}

export function renderBackInStock(data: BackInStockEmailData): { subject: string; html: string } {
  const subject = `Back in stock – ${data.productTitle}`;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">Good news!</p>
    <p style="margin:0 0 20px;font-size:15px;"><strong>${esc(data.productTitle)}</strong>, which you added to your wishlist, is back in stock.</p>
    ${ctaButton('View product', data.productUrl)}
  `;

  return {
    subject,
    html: baseLayout(subject, body),
  };
}
