import { SupportNotificationService } from './support-notification.service';
import { SUPPORT_SETTINGS_KEYS } from './support.constants';

type Admin = { phone: string | null };

function makeService(opts: { settings?: Record<string, string>; admins?: Admin[] } = {}) {
  const store = new Map(Object.entries(opts.settings ?? {}));
  const admins = opts.admins ?? [{ phone: '+33600000001' }];

  const prisma = {
    platformSettings: {
      findMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in.filter((k) => store.has(k)).map((k) => ({ key: k, value: store.get(k)! })),
      ),
      upsert: jest.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        store.set(where.key, create.value);
        return { key: where.key, value: create.value };
      }),
    },
    admin: { findMany: jest.fn(async () => admins) },
  };

  return { service: new SupportNotificationService(prisma as never), store, prisma };
}

describe('SupportNotificationService', () => {
  describe('getSettings', () => {
    it('turns SMS on for a never-configured install so the first chat reaches someone', async () => {
      const { service } = makeService();

      expect(await service.getSettings()).toEqual({
        smsEnabled: true,
        smsPhones: [],
        smsCooldownMin: 15,
        inactiveCloseHours: 72,
      });
    });

    it('honours an explicit off', async () => {
      const { service } = makeService({ settings: { [SUPPORT_SETTINGS_KEYS.smsEnabled]: 'false' } });

      expect((await service.getSettings()).smsEnabled).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('strips the formatting a phone is typed with and rewrites a 00 prefix', async () => {
      const { service } = makeService();

      expect((await service.updateSettings({ smsPhones: ['+33 6-12.34(56)78', '0034 600 000 000'] })).smsPhones).toEqual([
        '+33612345678',
        '+34600000000',
      ]);
    });
  });

  describe('resolvePhones', () => {
    it('falls back to every admin with a phone while no number is configured', async () => {
      const { service } = makeService({ admins: [{ phone: '+33600000001' }, { phone: null }, { phone: '+33600000002' }] });

      expect(await service.resolvePhones()).toEqual(['+33600000001', '+33600000002']);
    });

    it('uses the configured numbers once they exist, without touching the admin table', async () => {
      const { service, prisma } = makeService({
        settings: { [SUPPORT_SETTINGS_KEYS.smsPhones]: JSON.stringify(['+33611111111']) },
      });

      expect(await service.resolvePhones()).toEqual(['+33611111111']);
      expect(prisma.admin.findMany).not.toHaveBeenCalled();
    });

    it('pages nobody when support SMS is switched off', async () => {
      const { service } = makeService({ settings: { [SUPPORT_SETTINGS_KEYS.smsEnabled]: 'false' } });

      expect(await service.resolvePhones()).toEqual([]);
    });

    it('pages nobody when no admin has a phone on file', async () => {
      const { service } = makeService({ admins: [{ phone: null }] });

      expect(await service.resolvePhones()).toEqual([]);
    });
  });
});
