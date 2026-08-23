import { Injectable, Logger } from '@nestjs/common';
import { EmailTransportService } from '../email/email-transport.service';

export interface TrackingOptions {
  trackingToken: string;
  unsubscribeToken: string;
}

@Injectable()
export class NewsletterMailerService {
  private readonly logger = new Logger(NewsletterMailerService.name);

  constructor(private readonly emailTransport: EmailTransportService) {}

  get baseUrl(): string {
    return (
      process.env.NEWSLETTER_PUBLIC_BASE_URL ??
      process.env.API_URL ??
      'http://localhost:4000'
    );
  }

  /**
   * Rewrites <a href> links for click tracking, appends an open-tracking pixel,
   * and adds an unsubscribe footer link. Links to mailto:, tel:, #, and the
   * unsubscribe URL itself are left untouched to avoid tracking-loop issues.
   */
  buildTrackedHtml(
    html: string,
    { trackingToken, unsubscribeToken }: TrackingOptions,
  ): string {
    const base = this.baseUrl;
    const unsubscribeUrl = `${base}/newsletter/unsubscribe/${unsubscribeToken}`;

    let tracked = html.replace(
      /(<a\b[^>]*\bhref\s*=\s*)(["'])([^"']*)\2/gi,
      (match, prefix: string, quote: string, url: string) => {
        if (
          /^(mailto:|tel:|#)/i.test(url) ||
          url.includes('/newsletter/unsubscribe/')
        ) {
          return match;
        }
        const clickUrl = `${base}/newsletter/track/click/${trackingToken}?u=${encodeURIComponent(url)}`;
        return `${prefix}${quote}${clickUrl}${quote}`;
      },
    );

    const pixel = `<img src="${base}/newsletter/track/open/${trackingToken}" width="1" height="1" alt="" style="display:none" />`;
    const unsubscribeFooter = `<p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px"><a href="${unsubscribeUrl}" style="color:#9ca3af">Unsubscribe</a></p>`;

    if (/<\/body>/i.test(tracked)) {
      tracked = tracked.replace(
        /<\/body>/i,
        `${unsubscribeFooter}${pixel}</body>`,
      );
    } else {
      tracked = `${tracked}${unsubscribeFooter}${pixel}`;
    }

    return tracked;
  }

  async sendCampaignEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    await this.emailTransport.send(to, subject, html);
  }

  async sendTestEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const banner = `<div style="background:#fef3c7;color:#92400e;padding:8px 16px;font-size:12px;text-align:center;font-weight:600">TEST EMAIL — tracking links and unsubscribe link are inactive in this preview</div>`;
    await this.emailTransport.send(to, `[TEST] ${subject}`, `${banner}${html}`);
    this.logger.log(`Test email sent to ${to}`);
  }
}
