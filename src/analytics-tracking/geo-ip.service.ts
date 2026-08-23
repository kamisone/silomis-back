import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import * as geoip from 'geoip-lite';

@Injectable()
export class GeoIpService {
  /** Reuses whatever secret env var already exists rather than requiring a dedicated one. */
  private readonly salt = process.env.ANALYTICS_IP_SALT ?? process.env.SECRETS_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'silomis-visitor-salt';

  countryFromIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    const geo = geoip.lookup(ip);
    return geo?.country ?? null;
  }

  /** sha256(salt + ip) — never the raw IP. Global per-visitor digest, not per-product. */
  visitorHash(ip: string | null | undefined): string | null {
    if (!ip) return null;
    return createHash('sha256').update(`${this.salt}:${ip}`).digest('hex');
  }
}
