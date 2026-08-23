// rrweb incremental-mutation events carry `type: 3` — text/attribute changes,
// exactly the kind that could leak a typed value rrweb's own input masking
// missed. Full-snapshot events (type 2) are excluded: scanning the entire DOM
// dump on every batch would be expensive and is largely static chrome/markup.
const MUTATION_EVENT_TYPE = 3;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Loose 13-19 digit run, optionally grouped by spaces/dashes — catches most PAN-shaped strings.
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){13,19}\b/;

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
