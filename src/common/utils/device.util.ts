export function deviceFromUserAgent(userAgent: string | null | undefined): 'mobile' | 'desktop' | null {
  if (!userAgent) return null;
  return /mobile|android|iphone|ipad|ipod/i.test(userAgent) ? 'mobile' : 'desktop';
}
