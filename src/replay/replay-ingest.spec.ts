import { ReplayTrackingService } from './replay-tracking.service';
import { redactSensitiveData } from './replay.util';

describe('redactSensitiveData', () => {
  it('blanks emails and grouped card numbers in mutations, keeping the event and its length', () => {
    const [out] = redactSensitiveData([{ type: 3, data: { adds: [{ node: { textContent: 'Write to support@silomis.com today' } }], texts: [{ value: '4242 4242 4242 4242' }] } }]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('support@silomis.com');
    expect(json).not.toContain('4242 4242');
    expect((out.data as { adds: { node: { textContent: string } }[] }).adds[0].node.textContent).toHaveLength('Write to support@silomis.com today'.length);
  });

  it('leaves full snapshots and plain mutations untouched', () => {
    const snap = { type: 2, data: { text: 'a@b.fr' } };
    const plain = { type: 3, data: { texts: [{ value: 'Ordered 1756300000000' }] } };
    expect(redactSensitiveData([snap, plain])).toEqual([snap, plain]);
  });
});

describe('ReplayTrackingService.ingestBatch — concurrent batches', () => {
  it('gives two batches arriving together different chunks, and stores both', async () => {
    let chunkCount = 0;
    const session = { id: 's1', status: 'active', eventCount: 0, chunkCount: 0, maxScrollPct: 0 };
    const uploads: string[] = [];
    const prisma = {
      replaySession: {
        // Both calls see the same stale row, as two requests in flight do.
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockImplementation(async ({ data, select }: { data: { chunkCount?: { increment: number } }; select?: unknown }) => {
          if (data.chunkCount) chunkCount += data.chunkCount.increment;
          return select ? { chunkCount } : session;
        }),
      },
      replaySessionChunk: { create: jest.fn().mockResolvedValue({}) },
      replayEvent: { createMany: jest.fn() },
    };
    const gcs = { upload: jest.fn().mockImplementation(async (_b: Buffer, key: string) => void uploads.push(key)) };
    const service = new ReplayTrackingService(prisma as never, gcs as never, {} as never, {} as never);

    const batch = (n: number) => ({ events: [{ type: 3, timestamp: n, data: {} }], markers: [] });
    await Promise.all([service.ingestBatch('s1', batch(1) as never), service.ingestBatch('s1', batch(2) as never)]);

    expect(new Set(uploads).size).toBe(2);
    expect(prisma.replaySessionChunk.create.mock.calls.map((c) => c[0].data.sequence).sort()).toEqual([0, 1]);
  });
});
