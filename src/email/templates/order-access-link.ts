import { baseLayout, ctaButton, esc } from './layout';
import { COPY, resolveLang } from './copy';

export interface OrderAccessLinkEmailData {
  orderNumber: string;
  customerName: string;
  trackingUrl: string;
  locale?: string | null;
}

/**
 * The "email me a secure link" mail, sent when someone who looked an order up
 * with its number and the buyer's address asks to open its conversation.
 *
 * It goes to the address on the order and nowhere else, so clicking it is what
 * proves the reader owns that mailbox. That makes it a security notice as much
 * as a convenience, which is why it says plainly what to do if the reader did
 * not ask for it.
 */
export function renderOrderAccessLink(data: OrderAccessLinkEmailData): {
  subject: string;
  html: string;
} {
  const c = COPY[resolveLang(data.locale)].orderAccessLink;
  const subject = c.subject(data.orderNumber);

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 20px;font-size:15px;">${c.intro(esc(data.orderNumber))}</p>
    ${ctaButton(c.cta, data.trackingUrl)}
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">${c.ignore}</p>
  `;

  return { subject, html: baseLayout(subject, body, data.locale) };
}
