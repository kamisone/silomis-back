/**
 * Matching of a client address against admin-configured rules.
 *
 * Used to keep staff traffic out of the shop analytics: an admin browsing their
 * own store all day would otherwise register as real demand and skew the very
 * numbers they use to decide what to stock.
 *
 * Supports a single IPv4/IPv6 address, or an IPv4 CIDR range ("81.20.4.0/24").
 * IPv6 is matched exactly — CIDR maths for 128-bit addresses needs BigInt and
 * has no realistic use here, where the rule is "my office" or "my home".
 */

/** Normalises what Express reports so comparisons are like-for-like. */
export function normaliseIp(ip: string): string {
  return ip.trim().toLowerCase().replace(/^::ffff:/, '');
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    // Reject "01", "1e2", "" and anything non-numeric — Number() is too lenient.
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    out = out * 256 + value;
  }
  return out;
}

/** True when `ip` falls inside `rule` (an address or an IPv4 CIDR block). */
export function ipMatchesRule(ip: string, rule: string): boolean {
  const target = normaliseIp(ip);
  const cleanRule = normaliseIp(rule);
  if (!target || !cleanRule) return false;

  const slash = cleanRule.indexOf('/');
  if (slash === -1) return target === cleanRule;

  const base = cleanRule.slice(0, slash);
  const prefix = Number(cleanRule.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const baseInt = ipv4ToInt(base);
  const targetInt = ipv4ToInt(target);
  if (baseInt === null || targetInt === null) return false;

  // /0 would shift by 32, which is a no-op in JS and would match nothing.
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (targetInt & mask) >>> 0 === (baseInt & mask) >>> 0;
}

/** True when `ip` matches any rule. An empty list excludes nothing. */
export function ipMatchesAny(ip: string | null | undefined, rules: string[]): boolean {
  if (!ip || !rules.length) return false;
  return rules.some((rule) => ipMatchesRule(ip, rule));
}

/**
 * Validates and tidies admin input. Accepts newline- or comma-separated entries,
 * drops blanks and duplicates, and reports anything unparseable so the admin
 * finds out at save time rather than wondering why their traffic still counts.
 */
export function parseIpRules(raw: string): { rules: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const rules: string[] = [];
  const invalid: string[] = [];

  for (const entry of raw.split(/[\n,]/)) {
    const value = normaliseIp(entry);
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);

    // A rule is valid if it can match something: an IPv4, an IPv4 CIDR, or a
    // literal IPv6 (which we only ever compare verbatim).
    const slash = value.indexOf('/');
    const isValid =
      slash === -1
        ? ipv4ToInt(value) !== null || value.includes(':')
        : ipv4ToInt(value.slice(0, slash)) !== null &&
          /^\d{1,2}$/.test(value.slice(slash + 1)) &&
          Number(value.slice(slash + 1)) <= 32;

    if (isValid) rules.push(value);
    else invalid.push(entry.trim());
  }

  return { rules, invalid };
}
