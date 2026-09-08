import { AdminsService } from './admins.service';

/**
 * Only the phone plumbing is under test — an admin with no number on file is
 * unreachable by every SMS alert (orders, low stock, support), and until the
 * field was added to create/update there was no way to give them one.
 */
function makeService() {
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    admin: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return rows.get(where.id) ?? null;
        return [...rows.values()].find((r) => r.email === where.email) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'a1', ...data };
        rows.set('a1', row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const current = rows.get(where.id)!;
        for (const [k, v] of Object.entries(data)) if (v !== undefined) current[k] = v;
        return current;
      }),
      count: jest.fn(async () => rows.size),
    },
  };
  return { service: new AdminsService(prisma as never), rows, prisma };
}

describe('AdminsService phone handling', () => {
  it('stores a phone given at creation, normalized the way SmsService stores a recipient', async () => {
    const { service } = makeService();

    const created = await service.create({ name: 'Ops', email: 'ops@shop.test', password: 'secret1', phone: '+33 6-12.34(56)78' });

    // The gateway polls GET /sms?to=… with an exact match, so a spaced number
    // would queue and never be picked up.
    expect(created.phone).toBe('+33612345678');
  });

  it('rewrites a 00 prefix to +', async () => {
    const { service } = makeService();

    expect((await service.create({ name: 'Ops', email: 'ops@shop.test', password: 'secret1', phone: '0034600000000' })).phone).toBe(
      '+34600000000',
    );
  });

  it('stores null when no phone is given', async () => {
    const { service } = makeService();

    expect((await service.create({ name: 'Ops', email: 'ops@shop.test', password: 'secret1' })).phone).toBeNull();
  });

  it('saves a phone through the profile update, not only through the 2FA form', async () => {
    const { service } = makeService();
    const created = await service.create({ name: 'Ops', email: 'ops@shop.test', password: 'secret1' });

    expect((await service.patch(created.id, { phone: '+33612345678' })).phone).toBe('+33612345678');
  });

  it('leaves the stored number alone when the patch omits it', async () => {
    const { service } = makeService();
    const created = await service.create({ name: 'Ops', email: 'ops@shop.test', password: 'secret1', phone: '+33612345678' });

    expect((await service.patch(created.id, { name: 'Ops team' })).phone).toBe('+33612345678');
  });

  it('clears the number on an explicit blank', async () => {
    const { service } = makeService();
    const created = await service.create({ name: 'Ops', email: 'ops@shop.test', password: 'secret1', phone: '+33612345678' });

    expect((await service.patch(created.id, { phone: '' })).phone).toBeNull();
  });
});
