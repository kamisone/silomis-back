import { Request } from 'express';

/** Resolves the real client IP through a reverse proxy — falls back to the first X-Forwarded-For entry when req.ip isn't populated. */
export function extractIp(req: Request): string | null {
  if (req.ip) return req.ip;
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return first?.trim() || null;
}
