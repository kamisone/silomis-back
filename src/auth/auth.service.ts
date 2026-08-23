import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminsService } from '../admins/admins.service';
import { MfaChallengeResult, MfaService } from './mfa.service';

export type LoginResult =
  | { access_token: string; refresh_token: string }
  | ({ mfaRequired: true } & MfaChallengeResult);

export type TokenPair = { access_token: string; refresh_token: string };

// Refresh tokens are valid for 15 days and rotated on every use.
const REFRESH_TOKEN_TTL = '15d';
const REFRESH_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;

interface RefreshTokenPayload {
  sub: string;
  email: string;
  jti: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly mfaService: MfaService,
    private readonly prisma: PrismaService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const admin = await this.adminsService.findByEmail(email);
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      this.logger.warn(`login: failed attempt for email=${email} (admin ${admin ? 'found' : 'not found'})`);
      throw new UnauthorizedException();
    }

    if (admin.mfaEnabled) {
      const challenge = await this.mfaService.initChallenge(admin.id, admin.email, admin.preferredMfaMethod);
      return { mfaRequired: true, ...challenge };
    }

    return this.issueTokens(admin.id, admin.email);
  }

  async verifyMfa(challengeToken: string, otp: string): Promise<TokenPair> {
    const { adminId, email } = await this.mfaService.verify(challengeToken, otp);
    return this.issueTokens(adminId, email);
  }

  /**
   * Refresh-token rotation: validates the presented refresh token against
   * the persisted record, atomically claims it for rotation, and issues a
   * brand-new access/refresh pair. A revoked-but-presented token indicates
   * reuse (theft) — the entire token family for that admin is revoked,
   * forcing re-login everywhere.
   *
   * The claim is a single conditional UPDATE (`WHERE id = ... AND
   * "revokedAt" IS NULL`), not a read-then-write — Postgres serializes
   * concurrent UPDATEs against the same row, so when several requests
   * (parallel API calls, multiple open tabs) present the same refresh token
   * at once, exactly one can flip revokedAt from NULL. A find-then-save
   * pattern has a race window here and is the classic bug behind "why does
   * the admin get logged out out of nowhere".
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload.jti) throw new UnauthorizedException('Invalid refresh token');

    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!stored || stored.adminId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const claim = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claim.count === 1) {
      // We won the claim — mint the replacement and record the link.
      const tokens = await this.issueTokens(payload.sub, payload.email);
      const decoded = this.jwtService.decode<RefreshTokenPayload>(tokens.refresh_token);
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { replacedByTokenId: decoded.jti },
      });
      return tokens;
    }

    // Someone else already claimed this token between our read and our
    // UPDATE. Re-read it to see whether that was a benign concurrent
    // rotation (another request racing the same still-valid token) or
    // genuine reuse of an already-settled, previously-rotated token.
    const current = await this.prisma.refreshToken.findUnique({ where: { id: stored.id } });

    // Multiple browser tabs / parallel requests open at once all carry the
    // same (now-expired) refresh token and all fire rotation requests
    // together. The first wins the claim above; the rest land here
    // milliseconds later. Within a short grace window and with a
    // replacedByTokenId recorded (proving the revocation was a normal
    // rotation, not an attacker clearing the field), treat this as the
    // same race and hand the loser a fresh, valid session too rather than
    // logging them out.
    const RACE_GRACE_MS = 30_000;
    if (
      current?.replacedByTokenId &&
      current.revokedAt &&
      Date.now() - current.revokedAt.getTime() < RACE_GRACE_MS
    ) {
      this.logger.warn(`refresh: concurrent rotation race detected for admin=${stored.adminId} — re-issuing tokens`);
      return this.issueTokens(payload.sub, payload.email);
    }

    // Outside the grace window and/or no replacedByTokenId → genuine reuse
    // (stolen token presented after the rotation chain would have settled).
    this.logger.warn(`refresh: reuse of revoked token detected for admin=${stored.adminId} — revoking all sessions`);
    await this.prisma.refreshToken.updateMany({
      where: { adminId: stored.adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedException('Refresh token has already been used');
  }

  /** Revokes the refresh token for this session (called on logout). */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        ignoreExpiration: true,
      });
      if (payload.jti) {
        await this.prisma.refreshToken.updateMany({
          where: { id: payload.jti },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // Invalid/garbage token — nothing to revoke.
    }
  }

  private async issueTokens(sub: string, email: string): Promise<TokenPair> {
    const access_token = this.jwtService.sign({ sub, email });

    const record = await this.prisma.refreshToken.create({
      data: {
        adminId: sub,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    const refresh_token = this.jwtService.sign(
      { sub, email, jti: record.id },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: REFRESH_TOKEN_TTL },
    );

    return { access_token, refresh_token };
  }
}
