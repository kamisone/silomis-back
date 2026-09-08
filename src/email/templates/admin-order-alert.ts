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
};

export function renderAdminOrderAlert(event: string, data: AdminOrderAlertEmailData): { subject: string; html: string } {
  const heading = HEADING[event] ?? event;
  // Same brand tag as the SMS and the layout footer — SELLER_NAME, not a
  // literal, so one message never carries two different brand names.
  const subject = `[${process.env.SELLER_NAME ?? 'Silomis'}] ${heading}`;

  const body = `
    <p style="margin:0 0 20px;font-size:15px;">${esc(data.summary)}</p>
    ${data.detailUrl ? ctaButton('View order', data.detailUrl) : ''}
  `;

  return {
    subject,
    html: baseLayout(subject, body),
  };
}
