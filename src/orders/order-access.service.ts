import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ShopEmailService } from '../email/shop-email.service';
import { CustomerSmsService } from '../sms/customer-sms.service';
import { samePhone } from '../common/utils/phone';
import { Order } from '../../generated/prisma/client';
import {
  ACCESS_LINK_MAX_PER_HOUR,
  ORDER_GRANT_TTL_SECONDS,
  OrderAccessGrant,
  OrderAccessLevel,
  secretsMatch,
} from './order-access.constants';

/** What a visitor presents to prove the order is theirs. */
export interface OrderCredentials {
  /** The `trackingToken` from an order email. Proves mailbox control. */
  token?: string;
  /** The address on the order. Proves only that they know it. */
  email?: string;
  /** The phone on the order, typed any way. Worth the same as the email. */
  phone?: string;
  /** A previously issued grant, replayed from the visitor's cookie. */
  grant?: string;
}

/**
 * Turns a credential into a signed, expiring grant, and hands out the emailed
 * link that upgrades a weak credential into a strong one.
 *
 * Kept out of OrdersService deliberately: the conversation feature
 * authenticates through this and nothing else, and a customer-facing
 * authorisation path is easier to audit when it is one small file rather than
 * three methods inside a thousand-line order service.
 */
@Injectable()
export class OrderAccessService {
  private readonly logger = new Logger(OrderAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly email: ShopEmailService,
    private readonly sms: CustomerSmsService,
  ) {}

  // ── Credentials → level ────────────────────────────────────────────────

  /**
   * The strongest level `creds` earns on `order`, or null if they earn none.
   *
   * A grant is checked first and trusted for the level it was issued at: it is
   * this service's own signature, and re-deriving the level would mean
   * re-reading a credential the visitor no longer has to send.
   */
  async levelFor(order: Order, creds: OrderCredentials): Promise<OrderAccessLevel | null> {
    const grant = this.verifyGrant(creds.grant);
    if (grant?.orderId === order.id) return grant.level;

    if (
      creds.token &&
      order.trackingToken &&
      secretsMatch(creds.token, order.trackingToken)
    ) {
      return 'full';
    }
    if (this.emailMatches(order, creds.email)) return 'status';
    if (await this.phoneMatches(order, creds.phone)) return 'status';
    return null;
  }

  private emailMatches(order: Order, email?: string): boolean {
    return !!email && !!order.customerEmail && order.customerEmail.toLowerCase() === email.trim().toLowerCase();
  }

  /**
   * The phone is stored in E.164; the visitor types it however they like —
   * "06 12 34 56 78" is read with the shipping country's dialling code, the
   * same way checkout read it.
   */
  private async phoneMatches(order: Order, phone?: string): Promise<boolean> {
    if (!phone || !order.customerPhone) return false;
    const iso = (order.shippingAddressSnapshot as { country?: string } | null)?.country;
    const country = iso
      ? await this.prisma.country.findUnique({ where: { isoCode: iso.toUpperCase() }, select: { phonePrefix: true } })
      : null;
    return samePhone(phone, order.customerPhone, country?.phonePrefix);
  }

  // ── Grants ─────────────────────────────────────────────────────────────

  /**
   * Issues a grant for `orderNumber`, or null when the credentials do not
   * prove ownership.
   *
   * Null covers "no such order" as well as "wrong credentials", and callers
   * must answer both the same way — the difference is exactly what an
   * enumeration attack is looking for.
   */
  async issueGrant(
    orderNumber: string,
    creds: OrderCredentials,
  ): Promise<{
    token: string;
    level: OrderAccessLevel;
    maxAge: number;
    orderNumber: string;
  } | null> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
    });
    if (!order) return null;

    const level = await this.levelFor(order, creds);
    if (!level) return null;

    const payload: OrderAccessGrant = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      level,
    };
    const token = this.jwt.sign(payload, {
      expiresIn: ORDER_GRANT_TTL_SECONDS,
    });

    return {
      token,
      level,
      maxAge: ORDER_GRANT_TTL_SECONDS,
      orderNumber: order.orderNumber,
    };
  }

  /** Verifies a grant, returning null for anything expired, forged or absent. */
  verifyGrant(raw?: string): OrderAccessGrant | null {
    if (!raw) return null;
    try {
      const payload = this.jwt.verify<OrderAccessGrant & { exp: number }>(raw);
      if (
        !payload?.orderId ||
        (payload.level !== 'status' && payload.level !== 'full')
      )
        return null;
      return {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        level: payload.level,
      };
    } catch {
      return null;
    }
  }

  // ── Access link ────────────────────────────────────────────────────────

  /**
   * Emails the order's tracking link to the address on the order — the step
   * that upgrades a visitor from `status` to `full`.
   *
   * Never throws and never reports what it did. A caller that could tell "sent"
   * from "no such order" would be an oracle for which order numbers exist and
   * which address bought them, which is the whole reason the weak credential is
   * not enough on its own.
   *
   * The link carries the order's existing `trackingToken` rather than a fresh
   * single-use secret: that token is already sitting in the customer's
   * confirmation and dispatch emails, so a second token would add a table and
   * a sweep job without removing anything an attacker can reach.
   */
  async sendAccessLink(
    orderNumber: string,
    proof: { email?: string; phone?: string; verifiedOrderId?: string },
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { orderNumber },
      });
      if (!order || !order.trackingToken) return;

      // Either proof will do, and neither changes where the mail goes: the
      // destination is always the address stored on the order, never one the
      // caller supplied.
      const byPhone = await this.phoneMatches(order, proof.phone);
      const proven =
        order.id === proof.verifiedOrderId ||
        this.emailMatches(order, proof.email) ||
        byPhone;
      if (!proven) return;

      if (!(await this.withinLinkQuota(order.id))) return;

      const base = process.env.APP_URL ?? '';
      const trackingUrl = `${base}/shop/orders/track/${order.orderNumber}?token=${order.trackingToken}`;

      // The link goes where the visitor showed they can read: a text when
      // they proved the phone, or when the order has no email to send it to.
      if (byPhone || !order.customerEmail) {
        await this.sms.send('access_link', order, trackingUrl);
        return;
      }
      await this.email.sendOrderAccessLink(order.customerEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName ?? order.customerEmail,
        trackingUrl,
        locale: order.customerLocale,
      });
    } catch (err) {
      // A failure here is invisible to the caller by design, so it has to be
      // visible in the logs instead.
      this.logger.error(
        `Access link for ${orderNumber} failed: ${(err as Error)?.message}`,
      );
    }
  }

  /**
   * Counts this order's link requests in a rolling hour.
   *
   * Fails *closed*, unlike the support gateway's rate limiter: a Redis outage
   * there costs an unthrottled chat message, here it would cost a customer an
   * inbox full of mail nobody asked for.
   */
  private async withinLinkQuota(orderId: string): Promise<boolean> {
    const key = `order:accesslink:${orderId}`;
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 3600);
      return count <= ACCESS_LINK_MAX_PER_HOUR;
    } catch (err) {
      this.logger.warn(
        `Redis unavailable for access-link quota, refusing: ${(err as Error)?.message}`,
      );
      return false;
    }
  }
}
