import { SendInService } from './send-in.service';

/**
 * The desk's rules: which step may follow which, which steps need a
 * photograph, and what a status change tells the customer.
 */
function makeService(job: Record<string, unknown>) {
  const updates: unknown[] = [];
  const events: unknown[] = [];
  const prisma = {
    sendInItemType: { findUnique: jest.fn(async () => ({ label: { en: 'Cap' } })) },
    sendInJob: {
      findUnique: jest.fn(async () => job),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        const created = (args.data.events as { create?: Record<string, unknown> } | undefined)?.create;
        if (created) events.push(created);
        return {
          ...job,
          ...args.data,
          status: (args.data.status as string) ?? job.status,
          events: [...((job.events as unknown[]) ?? []), ...(created ? [{ id: 'ev-new', createdAt: new Date(), ...created }] : [])],
          order: { id: 'o1', orderNumber: 'ORD-1', status: 'paid', customerName: 'A', customerEmail: 'a@x', createdAt: new Date() },
          orderItem: { id: 'oi1', titleSnapshot: 'Cap', personalizations: [] },
        };
      }),
    },
  };
  const emitted: unknown[] = [];
  const bus = { emit: jest.fn((name: string, payload: unknown) => emitted.push({ name, payload })) };
  const assetUrls = { resolveBatch: jest.fn(async (keys: string[]) => new Map(keys.map((k) => [k, `https://x/${k}`]))), resolve: jest.fn(async (k: string) => `https://x/${k}`) };
  const gcs = { upload: jest.fn(async () => undefined) };
  const personalization = { resolvedFromRow: jest.fn(), mockupOverlaySvg: jest.fn(() => '<svg/>') };
  const service = new SendInService(prisma as never, gcs as never, assetUrls as never, bus as never, personalization as never);
  return { service, updates, events, emitted, prisma };
}

const job = (over: Record<string, unknown> = {}) => ({
  id: 'j1',
  orderId: 'o1',
  status: 'awaiting_item',
  photoKeys: [],
  events: [],
  returnTrackingNumber: null,
  ...over,
});

describe('SendInService.update', () => {
  it('refuses a step that does not follow the current one', async () => {
    const { service } = makeService(job());
    await expect(service.update('j1', { status: 'returned' })).rejects.toThrow(/Cannot go from/);
  });

  it('needs a photograph of the item as it arrived', async () => {
    const { service } = makeService(job());
    await expect(service.update('j1', { status: 'received' })).rejects.toThrow(/photo/);
  });

  it('only takes media-library photos, so the links never expire in an inbox', async () => {
    const { service } = makeService(job());
    await expect(service.update('j1', { status: 'received', photoKeys: ['send-in/private.jpg'] })).rejects.toThrow(/photo/);
  });

  it('records the step as an event and tells the customer', async () => {
    const { service, events, emitted } = makeService(job());
    await service.update('j1', { status: 'received', photoKeys: ['media/a.jpg'], note: 'Arrived fine.' });
    expect(events).toEqual([{ status: 'received', note: 'Arrived fine.', photoKeys: ['media/a.jpg'] }]);
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { payload: { toStatus: string } }).payload.toStatus).toBe('received');
  });

  it('needs a tracking number before the item is marked sent back', async () => {
    const { service } = makeService(job({ status: 'done' }));
    await expect(service.update('j1', { status: 'returned' })).rejects.toThrow(/tracking number/);
    const { service: ok, events } = makeService(job({ status: 'done' }));
    await ok.update('j1', { status: 'returned', returnTrackingNumber: '6A123' });
    expect(events).toHaveLength(1);
  });

  it('a note alone is a timeline entry, not a status change', async () => {
    const { service, events, emitted } = makeService(job({ status: 'received' }));
    await service.update('j1', { note: 'Still queued behind two jobs.' });
    expect(events).toEqual([{ status: 'received', note: 'Still queued behind two jobs.', photoKeys: [] }]);
    // The listener ignores a same-status event, so nothing is mailed.
    expect((emitted[0] as { payload: { fromStatus: string; toStatus: string } }).payload).toMatchObject({ fromStatus: 'received', toStatus: 'received' });
  });

  it('lets a problem go back onto the bench', async () => {
    const { service, events } = makeService(job({ status: 'problem' }));
    await service.update('j1', { status: 'in_production' });
    expect(events[0]).toMatchObject({ status: 'in_production' });
  });
});

describe('SendInService.createJobsForOrder', () => {
  it('opens one job per item — every side of it — and none for an ordinary line', async () => {
    const created: unknown[] = [];
    const db = {
      orderItem: {
        findMany: jest.fn(async () => [
          {
            id: 'oi1',
            personalizations: [
              { placementKey: 'side-1', designJson: { version: 2, customerItem: { itemType: 'cap', photoKeys: ['send-in/a.jpg'], corners: [], note: 'hi' } } },
              { placementKey: 'side-2', designJson: { version: 2, customerItem: { itemType: 'cap', photoKeys: ['send-in/b.jpg'], corners: [], note: null } } },
            ],
          },
          { id: 'oi2', personalizations: [{ placementKey: 'front', designJson: { version: 2, customerItem: null } }] },
          { id: 'oi3', personalizations: [] },
        ]),
      },
      sendInJob: { create: jest.fn(async (args: { data: unknown }) => (created.push(args.data), { id: 'j-new' })) },
    };
    const { service } = makeService(job());
    await service.createJobsForOrder(db as never, 'o1');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ orderId: 'o1', orderItemId: 'oi1', itemType: 'cap', note: 'hi', status: 'awaiting_item', events: { create: { status: 'awaiting_item' } } });
    expect((created[0] as { sides: unknown[] }).sides).toEqual([
      { placementKey: 'side-1', photoKey: 'send-in/a.jpg', mockupKey: null },
      { placementKey: 'side-2', photoKey: 'send-in/b.jpg', mockupKey: null },
    ]);
  });
});
