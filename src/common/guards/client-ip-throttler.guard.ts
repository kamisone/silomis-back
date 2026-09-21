import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { extractIp } from '../utils/client-ip.util';

/**
 * ThrottlerGuard that counts against the *visitor's* address instead of the
 * caller's socket.
 *
 * Every storefront request reaches this API through the Next proxy, so the
 * default tracker (`req.ip`) is one address for the entire public internet:
 * the first handful of attempts would lock the endpoint for every customer at
 * once. The proxy stamps the real address on `x-original-client-ip`
 * (front/src/lib/proxy.ts), which is what this reads.
 *
 * When no usable address survives the hops — local development, or an ingress
 * that strips the header — it falls back to the socket rather than skipping
 * the limit: one shared bucket is a blunt instrument, but an unlimited
 * endpoint is worse, and the routes using this guard are the ones worth
 * protecting.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(extractIp(req) ?? req.ip ?? 'unknown');
  }
}
