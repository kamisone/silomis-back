export const REPLAY_GCS_PREFIX = 'replay-sessions';

export const MAX_BATCH_EVENTS = 500;
export const MAX_BATCH_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_SESSION_EVENTS = 20_000;

export const REPLAY_RETENTION_DAYS = Number(process.env.REPLAY_RETENTION_DAYS ?? 30);

/**
 * Fraction of LIVE-product sessions to record, 0–1. Default 1 (record all).
 *
 * Test products are a handful being deliberately validated, and their demand
 * report needs every session — they are never sampled. The live catalogue is
 * the whole shop under real ad traffic, where recording is diagnostic rather
 * than a census: a sample answers "why do people leave this page" just as well
 * and costs a fraction of the GCS volume.
 *
 * An env var rather than a platform setting on purpose. A setting with no
 * screen behind it is a switch nobody can find — `low_stock_alerts_enabled`
 * sat unreachable in this codebase for exactly that reason. This one lives
 * beside REPLAY_RETENTION_DAYS, where whoever tunes retention will see it.
 */
export const REPLAY_LIVE_SAMPLE_RATE = (() => {
  const raw = Number(process.env.REPLAY_LIVE_SAMPLE_RATE ?? 1);
  // An unparseable or out-of-range value records everything rather than
  // silently recording nothing — losing sessions is the worse failure.
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
})();

export function chunkObjectKey(sessionId: string, sequence: number): string {
  return `${REPLAY_GCS_PREFIX}/${sessionId}/${String(sequence).padStart(5, '0')}.json`;
}
