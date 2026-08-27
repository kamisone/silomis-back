import { containsLikelySensitiveData, batchByteSize } from './replay.util';
import { IngestReplayBatchSchema, EndReplaySessionSchema, StartReplaySessionSchema } from './dto/replay.dto';

/** An rrweb incremental-mutation event (type 3) — the only shape the scanner looks at. */
const mutation = (data: unknown) => ({ type: 3, data });
/** A full-snapshot event (type 2) — deliberately skipped by the scanner. */
const snapshot = (data: unknown) => ({ type: 2, data });

describe('containsLikelySensitiveData', () => {
  it('flags an email address anywhere in a mutation payload', () => {
    expect(containsLikelySensitiveData([mutation({ texts: [{ value: 'contact bob.smith@example.com' }] })])).toBe(true);
  });

  it('flags a grouped or dash-separated card-number-shaped run', () => {
    expect(containsLikelySensitiveData([mutation({ texts: [{ value: '4242 4242 4242 4242' }] })])).toBe(true);
    expect(containsLikelySensitiveData([mutation({ texts: [{ value: '4242-4242-4242-4242' }] })])).toBe(true);
  });

  it('does NOT flag a bare 13-digit epoch timestamp', () => {
    // Regression guard: a looser "any 13-19 digit run" pattern matches this,
    // and tripping the check drops the whole batch — rrweb events included —
    // so an ordinary session would silently lose its recording.
    expect(containsLikelySensitiveData([mutation({ texts: [{ value: 'Ordered 1756300000000' }] })])).toBe(false);
  });

  it('does not flag ordinary event JSON with no sensitive-looking values', () => {
    expect(containsLikelySensitiveData([mutation({ source: 2, type: 1, id: 1234, x: 56, y: 78 })])).toBe(false);
  });

  it('ignores full-snapshot events — only mutations are scanned', () => {
    const payload = { texts: [{ value: 'bob.smith@example.com' }] };
    expect(containsLikelySensitiveData([snapshot(payload)])).toBe(false);
    expect(containsLikelySensitiveData([mutation(payload)])).toBe(true);
  });

  it('never throws on garbage from an untrusted public endpoint', () => {
    expect(() => containsLikelySensitiveData([{}, { type: 3 }, { type: 3, data: null }])).not.toThrow();
    expect(containsLikelySensitiveData([])).toBe(false);
  });
});

describe('batchByteSize', () => {
  it('measures the serialized byte length, not the element count', () => {
    expect(batchByteSize([])).toBe(2); // "[]"
    expect(batchByteSize([{ a: 1 }])).toBe(Buffer.byteLength('[{"a":1}]'));
  });

  it('counts multi-byte characters as their UTF-8 length', () => {
    expect(batchByteSize(['é'])).toBeGreaterThan('["é"]'.length);
  });
});

describe('ReplayMarkerSchema (via IngestReplayBatchSchema)', () => {
  it('accepts every type in the ReplayEventType Prisma enum', () => {
    for (const type of ['session_start', 'session_end', 'click', 'scroll', 'navigation']) {
      const parsed = IngestReplayBatchSchema.safeParse({ markers: [{ type, timestampMs: 0 }] });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects an unknown marker type rather than storing it', () => {
    expect(IngestReplayBatchSchema.safeParse({ markers: [{ type: 'rage_click', timestampMs: 0 }] }).success).toBe(false);
  });

  it('rejects a negative or non-integer timestampMs', () => {
    expect(IngestReplayBatchSchema.safeParse({ markers: [{ type: 'click', timestampMs: -1 }] }).success).toBe(false);
    expect(IngestReplayBatchSchema.safeParse({ markers: [{ type: 'click', timestampMs: 1.5 }] }).success).toBe(false);
  });

  it('defaults both arrays so an empty body parses', () => {
    const parsed = IngestReplayBatchSchema.parse({});
    expect(parsed).toEqual({ events: [], markers: [] });
  });
});

describe('EndReplaySessionSchema', () => {
  it('accepts the closing session_end marker', () => {
    const parsed = EndReplaySessionSchema.parse({ markers: [{ type: 'session_end', timestampMs: 4200 }] });
    expect(parsed.markers).toHaveLength(1);
  });

  it('accepts a bodyless beacon — a cached older recorder sends no body at all', () => {
    expect(EndReplaySessionSchema.parse({})).toEqual({ markers: [] });
  });
});

describe('StartReplaySessionSchema', () => {
  it('requires a uuid productId', () => {
    expect(StartReplaySessionSchema.safeParse({ productId: 'not-a-uuid' }).success).toBe(false);
    expect(StartReplaySessionSchema.safeParse({ productId: '3f1e4c2a-0b6d-4f8e-9a71-2c5d8e0f1a3b' }).success).toBe(true);
  });

  it('caps the free-text fields rather than trusting client lengths', () => {
    const productId = '3f1e4c2a-0b6d-4f8e-9a71-2c5d8e0f1a3b';
    expect(StartReplaySessionSchema.safeParse({ productId, pageUrl: 'x'.repeat(2001) }).success).toBe(false);
    expect(StartReplaySessionSchema.safeParse({ productId, pageTitle: 'x'.repeat(501) }).success).toBe(false);
    expect(StartReplaySessionSchema.safeParse({ productId, cartToken: 'x'.repeat(101) }).success).toBe(false);
  });

  it('rejects a non-positive viewport dimension', () => {
    const productId = '3f1e4c2a-0b6d-4f8e-9a71-2c5d8e0f1a3b';
    expect(StartReplaySessionSchema.safeParse({ productId, viewportWidth: 0 }).success).toBe(false);
  });
});
