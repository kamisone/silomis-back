import { Injectable, Logger } from '@nestjs/common';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  async verify(token: string | undefined, ip?: string | null): Promise<boolean> {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    // No key configured → dev mode, skip
    if (!secretKey) return true;

    // Token missing → fail
    if (!token || token.length === 0) return false;

    try {
      const body = new URLSearchParams({ secret: secretKey, response: token });
      if (ip) body.set('remoteip', ip);

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(5000),
      });

      const data = (await res.json()) as TurnstileResponse;

      if (!data.success) {
        this.logger.warn(`Turnstile failed: ${JSON.stringify(data['error-codes'])}`);
      }

      return data.success === true;
    } catch (err) {
      // Network failure → fail open to avoid blocking real users on transient errors
      this.logger.error('Turnstile verification request failed', err);
      return true;
    }
  }
}
