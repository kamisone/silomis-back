import { baseLayout, ctaButton, esc } from './layout';

export interface AdminOrderAlertEmailData {
  summary: string;
  detailUrl: string | null;
}

const HEADING: Record<string, string> = {
  payment_succeeded: 'Payment received',
  payment_failed: 'Payment failed',
  order_cancelled: 'Order cancelled',
  order_shipped: 'Order shipped',
  order_delivered: 'Order delivered',
  low_stock: 'Low stock alert',
  support_message: 'New support message',
  order_message: 'New message on an order',
};

/** Where the button goes, when "the order" is not what the alert is about. */
const CTA: Record<string, string> = {
  support_message: 'Open the conversation',
  order_message: 'Open the conversation',
};

export function renderAdminOrderAlert(event: string, data: AdminOrderAlertEmailData): { subject: string; html: string } {
  const heading = HEADING[event] ?? event;
  // Same brand tag as the SMS and the layout footer — SELLER_NAME, not a
  // literal, so one message never carries two different brand names.
  const subject = `[${process.env.SELLER_NAME ?? 'Silomis'}] ${heading}`;

  const body = `
    <p style="margin:0 0 20px;font-size:15px;">${esc(data.summary)}</p>
    ${data.detailUrl ? ctaButton(CTA[event] ?? 'View order', data.detailUrl) : ''}
  `;

  return {
    subject,
    // English, explicitly. This mail goes to the shop, not to a customer, and
    // the admin panel it links into is English-only — where every other
    // template takes the recipient's locale, an omitted one here fell back to
    // French and wrapped an English alert in a French layout.
    html: baseLayout(subject, body, 'en'),
  };
}
