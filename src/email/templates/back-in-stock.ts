import { baseLayout, ctaButton, esc } from './layout';
import { COPY, resolveLang } from './copy';

export interface BackInStockEmailData {
  productTitle: string;
  productUrl: string;
  locale?: string | null;
}

export function renderBackInStock(data: BackInStockEmailData): {
  subject: string;
  html: string;
} {
  const c = COPY[resolveLang(data.locale)].backInStock;
  const subject = c.subject(data.productTitle);

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.intro}</p>
    <p style="margin:0 0 20px;font-size:15px;">${c.body(esc(data.productTitle))}</p>
    ${ctaButton(c.cta, data.productUrl)}
  `;

  return {
    subject,
    html: baseLayout(subject, body),
  };
}
