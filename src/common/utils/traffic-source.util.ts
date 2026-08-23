const SEARCH_ENGINE_HOSTS = /google|bing|yahoo|duckduckgo|baidu|yandex/i;
const SOCIAL_HOSTS = /facebook|instagram|tiktok|twitter|x\.com|pinterest|linkedin|snapchat/i;

/** Best-effort acquisition-channel label from a UTM param or the referring host. */
export function resolveTrafficSource(referrer: string | null | undefined, utmSource: string | null | undefined): string | null {
  if (utmSource) return utmSource;
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (SEARCH_ENGINE_HOSTS.test(host)) return 'search';
    if (SOCIAL_HOSTS.test(host)) return 'social';
    return host;
  } catch {
    return 'direct';
  }
}
