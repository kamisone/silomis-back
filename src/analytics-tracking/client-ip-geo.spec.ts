import { Request } from 'express';
import { extractIp, ORIGINAL_CLIENT_IP_HEADER } from '../common/utils/client-ip.util';
import { GeoIpService } from './geo-ip.service';

function req(headers: Record<string, string | string[]>, ip?: string): Request {
  return { headers, ip } as unknown as Request;
}

/** A real, routable address geoip-lite's bundled database resolves. */
const PUBLIC_IP = '81.2.69.142';

describe('extractIp', () => {
  it('prefers the proxy header — every storefront call arrives through next-api, so req.ip is that process', () => {
    expect(extractIp(req({ [ORIGINAL_CLIENT_IP_HEADER]: PUBLIC_IP }, '::ffff:127.0.0.1'))).toBe(PUBLIC_IP);
  });

  it('strips the IPv4-mapped IPv6 prefix Express reports for IPv4 peers', () => {
    expect(extractIp(req({ [ORIGINAL_CLIENT_IP_HEADER]: `::ffff:${PUBLIC_IP}` }))).toBe(PUBLIC_IP);
  });

  it('takes the first entry of a forwarded chain — the visitor, not the hops', () => {
    expect(extractIp(req({ [ORIGINAL_CLIENT_IP_HEADER]: `${PUBLIC_IP}, 10.0.0.1, 10.0.0.2` }))).toBe(PUBLIC_IP);
  });

  it('falls back to req.ip when no proxy header is present', () => {
    expect(extractIp(req({}, PUBLIC_IP))).toBe(PUBLIC_IP);
  });

  it('falls back to x-forwarded-for when neither is usable', () => {
    expect(extractIp(req({ 'x-forwarded-for': `${PUBLIC_IP}, 10.0.0.1` }, '127.0.0.1'))).toBe(PUBLIC_IP);
  });

  it('returns null rather than a loopback address that looks like a visitor', () => {
    // Storing 127.0.0.1 is what filled every analytics row with an address
    // that can never geolocate and a NULL country beside it.
    expect(extractIp(req({}, '::ffff:127.0.0.1'))).toBeNull();
  });

  it('rejects private ranges for the same reason', () => {
    for (const ip of ['10.0.0.5', '192.168.1.4', '172.16.0.1', '::1', '169.254.1.1']) {
      expect(extractIp(req({}, ip))).toBeNull();
    }
  });
});

describe('GeoIpService', () => {
  const geo = new GeoIpService();

  it('resolves a country for a routable address', () => {
    expect(geo.countryFromIp(PUBLIC_IP)).toMatch(/^[A-Z]{2}$/);
  });

  it('resolves the same address in its IPv4-mapped form — the form Express actually reports', () => {
    expect(geo.countryFromIp(`::ffff:${PUBLIC_IP}`)).toBe(geo.countryFromIp(PUBLIC_IP));
  });

  it('returns null for an address with no country rather than guessing', () => {
    expect(geo.countryFromIp('127.0.0.1')).toBeNull();
    expect(geo.countryFromIp(null)).toBeNull();
  });

  it('hashes both forms of one address to the same visitor', () => {
    expect(geo.visitorHash(`::ffff:${PUBLIC_IP}`)).toBe(geo.visitorHash(PUBLIC_IP));
  });

  it('never hashes a missing address into a shared identity', () => {
    expect(geo.visitorHash(null)).toBeNull();
    expect(geo.visitorHash('   ')).toBeNull();
  });
});

describe('the header chain a storefront request actually arrives with', () => {
  /**
   * visitor -> edge nginx -> k8s ingress -> Next -> this API. Each hop can
   * overwrite x-forwarded-for; only the edge header survives untouched, which
   * is the whole reason it exists.
   */
  it('recovers the visitor when the ingress has rewritten x-forwarded-for with its own peer', () => {
    const r = req(
      {
        [ORIGINAL_CLIENT_IP_HEADER]: PUBLIC_IP,
        // What ingress-nginx writes when use-forwarded-headers is off.
        'x-forwarded-for': '192.168.49.1',
      },
      '::ffff:10.244.0.1',
    );

    expect(extractIp(r)).toBe(PUBLIC_IP);
  });

  it('still works from the forwarded chain when the edge header is absent', () => {
    // A deployment with no edge nginx, or a cluster with forwarded headers on.
    expect(extractIp(req({ 'x-forwarded-for': `${PUBLIC_IP}, 192.168.49.1` }, '10.244.0.1'))).toBe(PUBLIC_IP);
  });

  it('reports null when every hop only shows internal addresses', () => {
    // Not a visitor we cannot geolocate — a chain that lost them. The
    // ip-debug endpoint exists to tell these two apart.
    expect(extractIp(req({ [ORIGINAL_CLIENT_IP_HEADER]: '192.168.49.1', 'x-forwarded-for': '10.244.0.1' }, '127.0.0.1'))).toBeNull();
  });
});
