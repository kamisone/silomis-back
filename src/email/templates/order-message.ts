import { baseLayout, ctaButton, esc } from './layout';
import { COPY, resolveLang } from './copy';

export interface OrderMessageEmailData {
  orderNumber: string;
  customerName: string;
  /** The reply itself, so the mail is worth opening on its own. */
  excerpt: string;
  /** How many images came with it, if any. */
  imageCount: number;
  /** Opens the order's Messages tab directly. */
  conversationUrl: string;
  locale?: string | null;
}

/** Long messages are cut rather than sent whole: the email is a nudge to the
 *  conversation, not a copy of it, and the reply may be edited or followed. */
const EXCERPT_MAX = 300;

/**
 * "The workshop has replied about your order."
 *
 * Sent in the language the customer ordered in, like every other mail they
 * get — unlike the shop's own alerts, which are English because the admin
 * panel is.
 */
export function renderOrderMessage(data: OrderMessageEmailData): {
  subject: string;
  html: string;
} {
  const c = COPY[resolveLang(data.locale)].orderMessage;
  const subject = c.subject(data.orderNumber);

  const trimmed =
    data.excerpt.length > EXCERPT_MAX
      ? `${data.excerpt.slice(0, EXCERPT_MAX).trimEnd()}…`
      : data.excerpt;

  // The reply as typed — newlines are meaningful now that the composer is a
  // textarea, and an email collapses them unless they are made into markup.
  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 16px;font-size:15px;">${c.intro(esc(data.orderNumber))}</p>
    ${
      trimmed
        ? `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #129c98;background:#f5f8f8;font-size:15px;white-space:pre-wrap;">${esc(trimmed)}</blockquote>`
        : ''
    }
    ${data.imageCount > 0 ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">${c.images(data.imageCount)}</p>` : ''}
    ${ctaButton(c.cta, data.conversationUrl)}
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">${c.reply}</p>
  `;

  return { subject, html: baseLayout(subject, body, data.locale) };
}
