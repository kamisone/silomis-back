import { Injectable, Logger } from '@nestjs/common';
import { EmailTransportService } from '../email/email-transport.service';
import { baseLayout, ctaButton, divider, mutedText, esc, fmtCents } from '../email/templates/layout';
import { Document } from '../../generated/prisma/client';

// English-only copy — no locale switch (product decision for this project).
const COPY = {
  invoice: {
    subject: (n: string, seller: string) => `Your invoice ${n} – ${seller}`,
    intro: 'Thank you for your order. Your invoice is now available.',
    cta: 'Download my invoice (PDF)',
  },
  receipt: {
    subject: (n: string, seller: string) => `Your receipt ${n} – ${seller}`,
    intro: 'Thank you for your order. Your receipt is now available.',
    cta: 'Download my receipt (PDF)',
  },
} as const;

type DocType = keyof typeof COPY;

@Injectable()
export class DocumentEmailService {
  private readonly logger = new Logger(DocumentEmailService.name);

  constructor(private readonly transport: EmailTransportService) {}

  async send(document: Document, downloadUrl: string): Promise<void> {
    const dt = (document.documentType in COPY ? document.documentType : 'receipt') as DocType;
    const copy = COPY[dt];
    const name = esc(document.customerName ?? 'Customer');
    const num = esc(document.documentNumber ?? '—');
    const date = document.issuedAt
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(document.issuedAt)
      : '—';

    const body = `
      <p style="margin:0 0 6px;font-size:15px;">Hello ${name},</p>
      <p style="margin:0 0 20px;font-size:15px;">${copy.intro}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin:0 0 8px;">
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Reference</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${num}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Amount paid</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${esc(fmtCents(document.totalCents))}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;">Date</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;">${esc(date)}</td>
        </tr>
      </table>

      ${ctaButton(copy.cta, downloadUrl)}

      ${divider()}
      ${mutedText('This link is valid for a limited time. Contact us if you need a new copy.')}
    `;

    const subject = copy.subject(num, document.sellerName);
    const html = baseLayout(subject, body);

    await this.transport.send(document.customerEmail, subject, html);
    this.logger.log(`Document email sent to ${document.customerEmail} (${num})`);
  }
}
