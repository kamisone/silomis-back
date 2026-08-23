import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class MfaNotificationService {
  private readonly logger = new Logger(MfaNotificationService.name);

  constructor(private readonly smsService: SmsService) {}

  async sendEmail(to: string, otp: string): Promise<void> {
    const from = process.env.SMTP_FROM ?? 'noreply@example.com';
    const subject = 'Your verification code';
    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; }
  .container { max-width: 480px; margin: 0 auto; padding: 32px 24px; }
  .otp { font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1b4965; margin: 24px 0; }
  .note { font-size: 12px; color: #64748b; margin-top: 16px; }
</style>
</head>
<body>
<div class="container">
  <p>Your admin verification code is:</p>
  <div class="otp">${otp}</div>
  <p class="note">This code expires in 5 minutes. Do not share it with anyone.</p>
</div>
</body></html>`;

    if (!process.env.SMTP_HOST) {
      this.logger.warn(`[MFA DEV] Email OTP for ${to}: ${otp}`);
      return;
    }

    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
        : undefined,
    });

    await transport.sendMail({ from, to, subject, html });
    this.logger.log(`MFA email OTP sent to ${to}`);
  }

  async sendSms(to: string, otp: string): Promise<void> {
    const message = `Your verification code is: ${otp}. Valid for 5 minutes.`;
    await this.smsService.addMessage(to, message);
    this.logger.log(`MFA SMS OTP queued for ${to}`);
  }
}
