import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailTransportService {
  private readonly logger = new Logger(EmailTransportService.name);

  isConfigured(): boolean {
    return !!process.env.SMTP_HOST;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!process.env.SMTP_HOST) {
      this.logger.warn(`[EMAIL DEV] ${subject} → ${to}`);
      return;
    }

    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
    });

    await transport.sendMail({ from: process.env.SMTP_FROM ?? 'noreply@example.com', to, subject, html });
    this.logger.log(`Email "${subject}" sent to ${to}`);
  }
}
