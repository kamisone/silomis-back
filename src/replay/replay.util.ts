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

const EMAIL_PATTERN_ALL = new RegExp(EMAIL_PATTERN.source, 'gi');
const CARD_NUMBER_PATTERN_ALL = new RegExp(CARD_NUMBER_PATTERN.source, 'g');

function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN_ALL, (m) => '*'.repeat(m.length)).replace(CARD_NUMBER_PATTERN_ALL, (m) => '*'.repeat(m.length));
}

function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}

/**
 * The same backstop as containsLikelySensitiveData, applied by blanking the
 * match rather than refusing the batch.
 *
 * Refusing it threw away every DOM change in it — and a replay is a chain:
 * once one batch of mutations is missing, every later one refers to nodes
 * the player never built, so the replay froze on the previous page for the
 * rest of the session while scrolls and clicks carried on. A shop email in a
 * page's footer copy was enough. Redacting keeps the chain whole and still
 * keeps the address or card number out of storage. Same length, so text
 * layout in the replay is unchanged.
 */
export function redactSensitiveData<T extends RawRrwebEvent>(events: T[]): T[] {
  return events.map((event) => (event?.type === MUTATION_EVENT_TYPE && event.data ? ({ ...event, data: redactDeep(event.data) } as T) : event));
}

export function batchByteSize(events: unknown[]): number {
  return Buffer.byteLength(JSON.stringify(events));
}
