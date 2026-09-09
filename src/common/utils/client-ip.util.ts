import { Request } from 'express';

/**
 * Header the front-end proxy stamps with the visitor's real address.
 *
 * Every storefront call reaches this API through Next's `next-api` proxy, so
 * `req.ip` is that process, not the visitor. A custom header is used rather
 * than relying on `X-Forwarded-For` alone because an ingress will replace the
 * standard forwarded set with its own peer unless it is explicitly configured
 * not to; a custom header survives the hop untouched.
 */
export const ORIGINAL_CLIENT_IP_HEADER = 'x-original-client-ip';

const PRIVATE_IP = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|169\.254\.)/i;

/** Strips the IPv4-mapped IPv6 prefix Express reports for IPv4 peers — geoip
 *  cannot parse `::ffff:81.2.69.142`, only `81.2.69.142`. */
function normalise(ip: string): string {
  return ip.trim().replace(/^::ffff:/i, '');
}

function isUsable(ip: string | null | undefined): ip is string {
  return !!ip && !PRIVATE_IP.test(normalise(ip));
}

/**
 * The visitor's address, or null when only internal hops are visible.
 *
 * Order matters: the proxy's header is checked first because it is the one
 * value nothing between the edge and this process can overwrite. `req.ip` is
 * the fallback and is correct on its own wherever `trust proxy` can see a real
 * `X-Forwarded-For` — a direct deployment, or a cluster with forwarded headers
 * enabled.
 *
 * Private and loopback addresses are rejected rather than returned: they mean a
 * hop swallowed the real one, and geolocating them yields null anyway. Callers
 * get an explicit null instead of a value that looks like a visitor but is this
 * machine — which is what filled every analytics row with `::ffff:127.0.0.1`
 * and no country.
 */
export function extractIp(req: Request): string | null {
  const raw = req.headers[ORIGINAL_CLIENT_IP_HEADER];
  const header = Array.isArray(raw) ? raw[0] : raw;
  // The proxy sets a single address, but tolerate a list and take the first.
  const edge = header?.split(',')[0];
  if (isUsable(edge)) return normalise(edge);

  if (isUsable(req.ip)) return normalise(req.ip);

  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  if (isUsable(first)) return normalise(first);

  return null;
}
