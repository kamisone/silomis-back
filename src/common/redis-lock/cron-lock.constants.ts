/**
 * Lock TTLs for the scheduled jobs, each set a little under its cron interval
 * so the lock is guaranteed to have expired by the next tick while still being
 * long enough that a slow run cannot be started twice.
 */
export const CRON_LOCK_TTL = {
  /** EVERY_MINUTE */
  minute: 55_000,
  /** EVERY_HOUR */
  hour: 55 * 60_000,
  /** Once a day (3AM / 4AM jobs) */
  day: 23 * 60 * 60_000,
} as const;
