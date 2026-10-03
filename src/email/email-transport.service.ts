import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Transporter } from 'nodemailer';

/**
 * The one way mail leaves this application.
 *
 * Four things here are deliberate, and each of them was a real problem:
 *
 * 1. **One pooled transport, built once.** It used to be created per send, so
 *    every email paid for a fresh TCP connection and TLS handshake — and a burst
 *    of order mail opened a burst of connections, which is what providers rate
 *    limit on.
 * 2. **A plain-text alternative beside the HTML.** Spam filters mark HTML-only
 *    mail down, and a watch or a text-only client showed an empty message. It is
 *    derived from the HTML rather than written twice, so it cannot drift from it.
 * 3. **Reply-To.** The From address is `no-reply@`, which is correct for a
 *    sender nobody should write to — but customers reply to order mail anyway,
 *    and without this their reply goes nowhere at all.
 * 4. **The credentials are checked at boot**, not on the first real order. A
 *    wrong or rotated token otherwise shows up as a customer not getting their
 *    confirmation, hours later, in a log nobody is reading.
 */
@Injectable()
export class EmailTransportService implements OnModuleInit {
  private readonly logger = new Logger(EmailTransportService.name);
  private transport: Transporter | null = null;

  isConfigured(): boolean {
    return !!process.env.SMTP_HOST;
  }

  /**
   * Says on startup whether mail can actually be sent.
   *
   * `verify()` opens the connection, negotiates TLS and authenticates without
   * sending anything, so it is safe to run on every boot. Deliberately NOT
   * fatal: a shop that cannot send email should still take orders — losing the
   * confirmation is bad, losing the sale is worse — so this logs at error level
   * and lets the application start.
   */
  async onModuleInit(): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'No SMTP_HOST — email is logged, not sent. Fine in development, not in production.',
      );
      return;
    }
    try {
      await (await this.getTransport()).verify();
      this.logger.log(
        `Email ready: ${process.env.SMTP_HOST} as ${process.env.SMTP_FROM ?? '(no SMTP_FROM)'}`,
      );
    } catch (err) {
      this.logger.error(
        `EMAIL WILL NOT SEND — ${process.env.SMTP_HOST} refused the connection or the credentials: ` +
          `${(err as Error).message}. Orders will still be taken; no mail will reach anyone.`,
      );
    }
  }

  private async getTransport(): Promise<Transporter> {
    if (this.transport) return this.transport;
    const nodemailer = await import('nodemailer');
    this.transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      // 465 is implicit TLS; 587 upgrades with STARTTLS, which is what `false`
      // means here — not "unencrypted".
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
        : undefined,
      // Held open between sends: order mail arrives in bursts, and a connection
      // per message is both slower and the thing providers throttle.
      pool: true,
      maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS ?? 3),
      maxMessages: Number(process.env.SMTP_MAX_MESSAGES ?? 50),
    });
    return this.transport;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(`[EMAIL DEV] ${subject} → ${to}`);
      return;
    }

    const transport = await this.getTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@example.com',
      to,
      subject,
      html,
      text: htmlToText(html),
      // Optional: without it a reply to an order email reaches nobody. With it,
      // the customer's reply lands wherever the shop actually reads mail.
      ...(process.env.SMTP_REPLY_TO
        ? { replyTo: process.env.SMTP_REPLY_TO }
        : {}),
    });
    this.logger.log(`Email "${subject}" sent to ${to}`);
  }
}

/**
 * The named entities our own templates use, plus the few any writer reaches for.
 *
 * Deliberately a short list and not a full HTML entity table: an unknown name is
 * left exactly as written, which is visible and fixable, rather than silently
 * dropped. Anything numeric is handled generically before this.
 */
const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ldquo: '\u201c',
  rdquo: '\u201d',
  lsquo: '\u2018',
  rsquo: '\u2019',
  middot: '\u00b7',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  euro: '\u20ac',
  times: '\u00d7',
  deg: '\u00b0',
};

/**
 * A readable plain-text version of one of our own emails.
 *
 * Not a general HTML-to-text converter, and it does not need to be: every
 * template goes through layout.ts, so the input is always a table-based email
 * with no scripts and no exotic markup. What matters is that a link's address
 * survives — a text part reading "click here" with no URL is worse than none —
 * and that the blocks stay separated.
 */
export function htmlToText(html: string): string {
  return (
    html
      // Head, style and script carry no reading matter, and `style` in
      // particular would otherwise dump the whole stylesheet into the text.
      .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, ' ')
      // A link becomes "label (url)", so the address is still there to copy.
      // Parentheses and not angle brackets: the tag stripper below would read
      // `<https://…>` as a tag and delete the address — which is precisely the
      // failure a text part exists to avoid.
      .replace(
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_m, href: string, label: string) => {
          const text = label.replace(/<[^>]*>/g, '').trim();
          return text && !text.includes(href) ? `${text} (${href})` : href;
        },
      )
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|table)>/gi, '\n')
      // The opening tag starts the line, so `</li>` must not end it too — a
      // newline from each would leave a blank line between every bullet.
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '')
      .replace(/<[^>]+>/g, '')
      // Entities last: doing them earlier would let a `&lt;p&gt;` in the copy
      // turn into a tag the stripper above then removed.
      //
      // Numeric first, then named. The templates set quotes and separators as
      // entities — a customer's embroidery text is printed as
      // `&ldquo;SILOMIS&rdquo;` and the embroidery line is joined with
      // `&middot;` — so a decoder that only knew the five XML entities left
      // those sitting in the text part verbatim, which is what a text-only
      // client would have shown the customer.
      .replace(/&#(\d+);/g, (_m, code: string) =>
        String.fromCodePoint(Number(code)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) =>
        String.fromCodePoint(parseInt(code, 16)),
      )
      .replace(
        /&([a-z]+);/gi,
        (match, name: string) => ENTITIES[name.toLowerCase()] ?? match,
      )
      // Tidy: trailing spaces, runs of blank lines, leading and trailing air.
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
