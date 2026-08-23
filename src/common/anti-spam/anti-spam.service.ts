import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TurnstileService } from './turnstile.service';

export interface AntiSpamInput {
  honeypot?: string;
  renderedAt?: number;
  turnstileToken?: string;
  name: string;
  contact: string;
  subject: string;
  message: string;
  ip?: string | null;
  userAgent?: string;
}

export interface AntiSpamResult {
  decision: 'accept' | 'suspicious' | 'block';
  /** true → return 200/201 to caller without storing — bot never knows it was blocked */
  silentBlock: boolean;
  score: number;
  reasons: string[];
}

// ── Thresholds ───────────────────────────────────────────────────────────
const MIN_SUBMISSION_MS = 1_500;
const SCORE_BLOCK = 80;
const SCORE_SUSPICIOUS = 40;

// ── Disposable email domains ────────────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamailblock.com', 'grr.la',
  'guerrillamail.info', 'temp-mail.org', 'throwaway.email', 'trashmail.com',
  'fakeinbox.com', 'yopmail.com', 'sharklasers.com', 'spam4.me', 'binkmail.com',
  'dispostable.com', 'maildrop.cc', 'discard.email', 'tempmail.com',
  'getairmail.com', 'mailnesia.com', 'mailnull.com', 'spamgourmet.com',
  'spamgourmet.net', 'spamgourmet.org', 'trashmail.at', 'trashmail.io',
  'tempinbox.com', 'mailtemp.info', 'fakemail.net', 'throwam.com',
]);

// ── Spam keyword patterns ───────────────────────────────────────────────
const SPAM_PATTERNS: RegExp[] = [
  /\bcasino\b/i, /\bpoker\b/i, /\bforex\b/i,
  /\bcrypto(?:currency)?\b/i, /\bbitcoin\b/i, /\bnft\b/i,
  /\bviagra\b/i, /\bcialis\b/i, /\bprescription\b/i,
  /earn\s+(?:from\s+)?home/i, /work\s+from\s+home/i, /make\s+money\s+fast/i,
  /\bbuy\s+now\b/i, /\bclick\s+here\b/i, /\bfree\s+money\b/i,
  /\bno\s+risk\b/i, /\bguaranteed\s+(?:return|income|profit)\b/i,
  /investment\s+opportunity/i, /loan\s+(?:fast|quick|easy|instant)/i,
  /\bweight\s+loss\b/i, /\bdiet\s+pill\b/i, /\bslimming\b/i,
  /\bwinner\b.*\bcongratulations\b/i,
];

@Injectable()
export class AntiSpamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly turnstile: TurnstileService,
  ) {}

  async evaluate(input: AntiSpamInput): Promise<AntiSpamResult> {
    const reasons: string[] = [];
    let score = 0;

    // ── 1. Honeypot ─────────────────────────────────────────────────────
    if (input.honeypot && input.honeypot.trim().length > 0) {
      reasons.push('honeypot_filled');
      score += 100;
    }

    // ── 2. Submission timing ───────────────────────────────────────────
    if (input.renderedAt && input.renderedAt > 0) {
      const elapsed = Date.now() - input.renderedAt;
      if (elapsed < MIN_SUBMISSION_MS) {
        reasons.push('too_fast');
        score += 80;
      }
    }

    // Early exit — obvious bot signals (avoid unnecessary network calls)
    if (score >= SCORE_BLOCK) {
      const result: AntiSpamResult = { decision: 'block', silentBlock: true, score, reasons };
      this.persistLog(result, input.ip, input.userAgent);
      return result;
    }

    // ── 3. Turnstile verification ──────────────────────────────────────
    const turnstileOk = await this.turnstile.verify(input.turnstileToken, input.ip);
    if (!turnstileOk) {
      reasons.push('turnstile_failed');
      score += 60;
    }

    // ── 4. Content heuristics ──────────────────────────────────────────
    const fullText = `${input.name} ${input.contact} ${input.subject} ${input.message}`;

    // URL density
    const urlCount = (fullText.match(/https?:\/\//gi) ?? []).length;
    if (urlCount > 2) {
      reasons.push('excessive_links');
      score += Math.min(urlCount * 10, 40);
    }

    // Spam keywords
    const keywordHits = SPAM_PATTERNS.filter((p) => p.test(fullText)).length;
    if (keywordHits > 0) {
      reasons.push('spam_keywords');
      score += Math.min(keywordHits * 25, 75);
    }

    // Disposable / throwaway email domain
    const emailDomainMatch = input.contact.match(/@([^@\s]+)$/);
    if (emailDomainMatch) {
      const domain = emailDomainMatch[1].toLowerCase();
      if (DISPOSABLE_DOMAINS.has(domain)) {
        reasons.push('disposable_email');
        score += 50;
      }
    }

    // Excessive capitalisation
    const letterChars = input.message.replace(/[^a-zA-Z]/g, '');
    if (letterChars.length > 20) {
      const capsRatio = input.message.replace(/[^A-Z]/g, '').length / letterChars.length;
      if (capsRatio > 0.8) {
        reasons.push('all_caps');
        score += 20;
      }
    }

    // Repetitive content (any word repeated > 5 times)
    const wordFreq = new Map<string, number>();
    for (const w of input.message.toLowerCase().split(/\s+/)) {
      if (w.length > 3) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
    }
    if ([...wordFreq.values()].some((c) => c > 5)) {
      reasons.push('repeated_content');
      score += 15;
    }

    // ── 5. Request metadata ────────────────────────────────────────────
    if (!input.userAgent || input.userAgent.length < 10) {
      reasons.push('missing_user_agent');
      score += 25;
    }

    // ── Decision ────────────────────────────────────────────────────────
    let decision: AntiSpamResult['decision'];
    let silentBlock = false;

    if (score >= SCORE_BLOCK) {
      decision = 'block';
      silentBlock = true;
    } else if (score >= SCORE_SUSPICIOUS) {
      decision = 'suspicious';
    } else {
      decision = 'accept';
    }

    const result: AntiSpamResult = { decision, silentBlock, score, reasons };
    this.persistLog(result, input.ip, input.userAgent);
    return result;
  }

  private persistLog(result: AntiSpamResult, ip?: string | null, userAgent?: string): void {
    // Fire-and-forget — never block the request on a log write
    this.prisma.spamLog
      .create({
        data: {
          ip: ip?.slice(0, 50) ?? null,
          score: result.score,
          decision: result.decision,
          reasons: result.reasons.join(',') || null,
          userAgent: userAgent?.slice(0, 500) ?? null,
        },
      })
      .catch(() => {});
  }
}
