import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import { Request } from 'express';
import { extractIp } from '../common/utils/client-ip.util';
import { OrderAccessService } from './order-access.service';

/** Header the BFF replays the customer's order grant on. */
const GRANT_HEADER = 'x-order-grant';

/**
 * Rate limiter for the order-tracking routes, counting the right thing.
 *
 * A limit is only useful if it counts the behaviour it means to stop, and
 * these routes carry two very different behaviours:
 *
 *  - **Without a grant** the caller is guessing. Order numbers are sequential
 *    and an email address is not a secret, so this is the enumeration surface
 *    and it is counted per visitor — one attacker walking a thousand order
 *    numbers must exhaust one bucket, not a thousand.
 *
 *  - **With a valid grant** the caller has already proved the order is theirs.
 *    Nothing is being guessed, so counting them against the same bucket only
 *    punishes a customer for reloading their own tracking page. They are
 *    counted per order instead, which still stops a runaway client but cannot
 *    lock anyone out of an order that is not theirs.
 *
 * The grant is verified, not merely present: a bucket key an attacker can
 * change at will is not a limit, and an unverified one would hand out a fresh
 * allowance per forged string.
 */
@Injectable()
export class OrderThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly access: OrderAccessService,
  ) {
    super(options, storageService, reflector);
  }

  protected getTracker(req: Request): Promise<string> {
    const raw = req.headers[GRANT_HEADER];
    const grant = this.access.verifyGrant(
      Array.isArray(raw) ? raw[0] : (raw ?? undefined),
    );
    if (grant) return Promise.resolve(`order:${grant.orderId}`);

    // No grant: nothing has been proved, so this is the enumeration surface
    // and the key must be the caller alone.
    //
    // Emphatically NOT keyed by order as well. That was the first version of
    // this, to stop a developer's reloads from sharing one bucket when every
    // hop is private and no real address is visible — and it handed an
    // enumerator a fresh allowance for every order number they tried, which is
    // precisely the attack the limit exists to stop. A shared bucket in
    // development is the correct trade: unproven requests are exactly the ones
    // that should be scarce, and a customer stops making them the moment their
    // credential becomes a cookie.
    return Promise.resolve(`ip:${extractIp(req) ?? req.ip ?? 'unknown'}`);
  }
}
