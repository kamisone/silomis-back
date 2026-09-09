import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import * as geoip from 'geoip-lite';

@Injectable()
export class GeoIpService {
  /** Reuses whatever secret env var already exists rather than requiring a dedicated one. */
  private readonly salt = process.env.ANALYTICS_IP_SALT ?? process.env.SECRETS_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'silomis-visitor-salt';

  /**
   * ISO-3166-1 alpha-2 for a client IP, or null when unresolvable (private or
   * loopback address, lookup miss). Offline against geoip-lite's bundled
   * database — the address itself is never sent anywhere.
   *
   * The `::ffff:` strip is not cosmetic: Express reports IPv4 peers in that
   * IPv4-mapped IPv6 form, and geoip-lite returns null for it, so leaving it
   * on means no event ever gets a country.
   */
  countryFromIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    const cleaned = ip.trim().replace(/^::ffff:/i, '');
    return cleaned ? (geoip.lookup(cleaned)?.country ?? null) : null;
  }

  /** sha256(salt + ip) — never the raw IP. Global per-visitor digest, not per-product. */
  visitorHash(ip: string | null | undefined): string | null {
    if (!ip) return null;
    // Normalised the same way, or the same visitor hashes differently
    // depending on which hop reported their address.
    const cleaned = ip.trim().replace(/^::ffff:/i, '');
    if (!cleaned) return null;
    return createHash('sha256').update(`${this.salt}:${cleaned}`).digest('hex');
  }
}
