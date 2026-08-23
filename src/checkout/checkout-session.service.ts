import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CheckoutSession, CheckoutStep, Prisma } from '../../generated/prisma/client';
import { UpsertCheckoutSessionDto } from './dto/checkout.dto';

const SESSION_TTL_DAYS = 7;
const REDIS_TTL_S = 300; // 5-minute hot cache

const cacheKey = (cartToken: string) => `checkout:session:${cartToken}`;

@Injectable()
export class CheckoutSessionService {
  private readonly logger = new Logger(CheckoutSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Find or create ────────────────────────────────────────────────────

  async findOrCreate(cartToken: string, locale: string): Promise<CheckoutSession> {
    const cached = await this.fromCache(cartToken);
    if (cached) return cached;

    const existing = await this.prisma.checkoutSession.findUnique({ where: { cartToken } });
    if (existing && existing.expiresAt > new Date() && !existing.completedAt) {
      return this.cacheAndReturn(existing);
    }

    const session = await this.prisma.checkoutSession.create({
      data: { cartToken, orderId: null, step: 'address', formSnapshot: Prisma.JsonNull, locale, resumeToken: randomUUID(), expiresAt: this.expiresAt(), completedAt: null },
    });
    this.logger.log(`Checkout session created for cart ${cartToken}`);
    return this.cacheAndReturn(session);
  }

  // ── Upsert (auto-save from frontend) ─────────────────────────────────

  async upsert(dto: UpsertCheckoutSessionDto): Promise<CheckoutSession> {
    const existing = await this.prisma.checkoutSession.findUnique({ where: { cartToken: dto.cartToken } });
    if (!existing) return this.findOrCreate(dto.cartToken, dto.locale ?? 'fr');

    const saved = await this.prisma.checkoutSession.update({
      where: { cartToken: dto.cartToken },
      data: {
        formSnapshot: dto.formSnapshot !== undefined ? ((dto.formSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull) : undefined,
        step: dto.step as CheckoutStep | undefined,
        orderId: dto.orderId !== undefined ? (dto.orderId ?? null) : undefined,
        locale: dto.locale,
        expiresAt: this.expiresAt(),
      },
    });
    await this.invalidate(dto.cartToken);
    return this.cacheAndReturn(saved);
  }

  // ── Find by cart token (cache-first) ─────────────────────────────────

  async findByCartToken(cartToken: string): Promise<CheckoutSession | null> {
    const cached = await this.fromCache(cartToken);
    if (cached) return cached;
    const session = await this.prisma.checkoutSession.findUnique({ where: { cartToken } });
    if (session) await this.cacheAndReturn(session);
    return session;
  }

  // ── Find by resume token (for email deep links) ──────────────────────

  async findByResumeToken(resumeToken: string): Promise<CheckoutSession> {
    const session = await this.prisma.checkoutSession.findUnique({ where: { resumeToken } });
    if (!session) throw new NotFoundException('Checkout session not found');
    if (session.expiresAt < new Date()) throw new NotFoundException('Checkout session has expired');
    if (session.completedAt) throw new NotFoundException('Checkout session already completed');
    return session;
  }

  // ── Mark complete (called once payment is confirmed) ─────────────────

  async markComplete(cartToken: string): Promise<void> {
    await this.prisma.checkoutSession.updateMany({ where: { cartToken }, data: { step: 'complete', completedAt: new Date() } });
    await this.invalidate(cartToken);
  }

  // ── Expired session cleanup (cron) ────────────────────────────────────

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.checkoutSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return result.count;
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private expiresAt(): Date {
    return new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  }

  private async fromCache(cartToken: string): Promise<CheckoutSession | null> {
    try {
      const raw = await this.redis.client.get(cacheKey(cartToken));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CheckoutSession;
      parsed.expiresAt = new Date(parsed.expiresAt);
      parsed.createdAt = new Date(parsed.createdAt);
      parsed.updatedAt = new Date(parsed.updatedAt);
      if (parsed.completedAt) parsed.completedAt = new Date(parsed.completedAt);
      // Treat expired cached sessions as a miss
      if (parsed.expiresAt < new Date() || parsed.completedAt) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async cacheAndReturn(session: CheckoutSession): Promise<CheckoutSession> {
    try {
      await this.redis.client.set(cacheKey(session.cartToken), JSON.stringify(session), 'EX', REDIS_TTL_S);
    } catch {
      // Redis failure must never break the checkout flow
    }
    return session;
  }

  private async invalidate(cartToken: string): Promise<void> {
    try {
      await this.redis.client.del(cacheKey(cartToken));
    } catch {
      // Swallow Redis errors
    }
  }
}
