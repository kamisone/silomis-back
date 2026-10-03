import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from '../sms/sms.service';
import { EmailTransportService } from '../email/email-transport.service';
import { baseLayout, mutedText, esc } from '../email/templates/layout';

@Injectable()
export class MfaNotificationService {
  private readonly logger = new Logger(MfaNotificationService.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly transport: EmailTransportService,
  ) {}

  /**
   * The admin sign-in code.
   *
   * It goes through the shared transport like every other email, which it did
   * not before: it built a connection of its own on every send and so was the
   * one message in the system with no plain-text alternative and no Reply-To.
   * Of all of them this is the worst to lose — a code that does not arrive locks
   * an administrator out of their own shop.
   *
   * English only, deliberately. This is not customer mail: it goes to the shop's
   * own staff, and there is no locale on an admin to read.
   */
  async sendEmail(to: string, otp: string): Promise<void> {
    const subject = 'Your verification code';
    const body = `
      <p style="margin:0 0 6px;font-size:15px;">Your admin verification code is:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0f172a;margin:22px 0;text-align:center;font-family:'SFMono-Regular',Consolas,monospace;">${esc(otp)}</div>
      ${mutedText('This code expires in 5 minutes. Do not share it with anyone. If you did not try to sign in, change your password.')}
    `;

    if (!this.transport.isConfigured()) {
      // The code itself in the log, so development sign-in still works without
      // a mail server. Never reached in production, where SMTP_HOST is set.
      this.logger.warn(`[MFA DEV] Email OTP for ${to}: ${otp}`);
      return;
    }

    await this.transport.send(to, subject, baseLayout(subject, body));
    this.logger.log(`MFA email OTP sent to ${to}`);
  }

  async sendSms(to: string, otp: string): Promise<void> {
    const message = `Your verification code is: ${otp}. Valid for 5 minutes.`;
    await this.smsService.addMessage(to, message);
    this.logger.log(`MFA SMS OTP queued for ${to}`);
  }
}
