import { baseLayout, ctaButton, mutedText, esc } from './layout';

export type OrderStatusKind = 'shipped' | 'delivered' | 'cancelled';

export interface OrderStatusEmailData {
  orderNumber: string;
  customerName: string;
  trackingUrl: string | null;
}

const COPY: Record<OrderStatusKind, { subjectSuffix: string; heading: string; message: string }> = {
  shipped: {
    subjectSuffix: 'has shipped',
    heading: 'Your order has shipped',
    message: 'Good news — your order is on its way.',
  },
  delivered: {
    subjectSuffix: 'has been delivered',
    heading: 'Your order has been delivered',
    message: 'Your order has arrived. We hope you love it!',
  },
  cancelled: {
    subjectSuffix: 'has been cancelled',
    heading: 'Your order has been cancelled',
    message: 'This order has been cancelled. If you did not request this, please contact our support team.',
  },
};

export function renderOrderStatus(kind: OrderStatusKind, data: OrderStatusEmailData): { subject: string; html: string } {
  const copy = COPY[kind];
  const subject = `Order ${data.orderNumber} ${copy.subjectSuffix}`;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">Hello ${esc(data.customerName)},</p>
    <p style="margin:0 0 20px;font-size:15px;">${copy.message}</p>
    <p style="font-size:13px;color:#64748b;margin:0;">Order reference : <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong></p>
    ${data.trackingUrl ? ctaButton('Track my order', data.trackingUrl) : ''}
    ${mutedText('If you have any questions, feel free to reach out to our support team.')}
  `;

  return { subject, html: baseLayout(copy.heading, body) };
}
