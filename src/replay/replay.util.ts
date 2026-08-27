// rrweb incremental-mutation events carry `type: 3` — text/attribute changes,
// exactly the kind that could leak a typed value rrweb's own input masking
// missed. Full-snapshot events (type 2) are excluded: scanning the entire DOM
// dump on every batch would be expensive and is largely static chrome/markup.
const MUTATION_EVENT_TYPE = 3;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Only the *grouped* PAN shape (4-4-4-N, space- or dash-separated). A looser
// "any 13-19 digit run" also matches a bare 13-digit epoch-millisecond
// timestamp, and since tripping this check drops the entire batch — rrweb
// events included — a false positive here silently breaks playback for a
// perfectly ordinary session. This is a backstop behind rrweb's own input
// masking, so it errs toward keeping the recording.
const CARD_NUMBER_PATTERN = /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]?\d{1,7}\b/;

interface RawRrwebEvent {
  type?: number;
  data?: unknown;
}

/** Server-side backstop behind rrweb's client-side input masking — scans only mutation events for email/card-number-shaped strings. */
export function containsLikelySensitiveData(events: RawRrwebEvent[]): boolean {
  for (const event of events) {
    if (event.type !== MUTATION_EVENT_TYPE) continue;
    const text = JSON.stringify(event.data ?? {});
    if (EMAIL_PATTERN.test(text) || CARD_NUMBER_PATTERN.test(text)) return true;
  }
  return false;
}

export function batchByteSize(events: unknown[]): number {
  return Buffer.byteLength(JSON.stringify(events));
}
