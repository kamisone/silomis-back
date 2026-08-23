export const REPLAY_GCS_PREFIX = 'replay-sessions';

export const MAX_BATCH_EVENTS = 500;
export const MAX_BATCH_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_SESSION_EVENTS = 20_000;

export const REPLAY_RETENTION_DAYS = Number(process.env.REPLAY_RETENTION_DAYS ?? 30);

export function chunkObjectKey(sessionId: string, sequence: number): string {
  return `${REPLAY_GCS_PREFIX}/${sessionId}/${String(sequence).padStart(5, '0')}.json`;
}
