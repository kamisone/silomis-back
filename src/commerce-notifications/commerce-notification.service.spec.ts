import { CommerceNotificationService, NotifyPayload } from './commerce-notification.service';
import { ADMIN_NOTIF_KEYS } from './commerce-notification.constants';

type Admin = { email: string; phone: string | null };

/** In-memory stand-ins for the only two tables the service reads. */
function makeService(opts: { settings?: Record<string, string>; admins?: Admin[] } = {}) {
  const store = new Map(Object.entries(opts.settings ?? {}));
  const admins = opts.admins ?? [{ email: 'owner@shop.test', phone: '+33600000001' }];

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

  const service = new CommerceNotificationService(prisma as never, null as never, null as never, null as never);
  return { service, store, prisma };
}

function smsBody(payload: Partial<NotifyPayload>): string {
  const full: NotifyPayload = { event: 'payment_succeeded', summary: 'Order SO-1042 paid by a@b.com — €49.90', ...payload };
  const { service } = makeService();
  return (service as unknown as { smsBody(p: NotifyPayload): string }).smsBody(full);
}

describe('CommerceNotificationService', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('smsBody', () => {
    it('tags the brand, then puts the order number and deep link on their own lines', () => {
      process.env.SELLER_NAME = 'Bébé9';

      expect(smsBody({ orderNumber: 'SO-1042', detailUrl: 'https://silomis.com/admin/shop/orders/abc' })).toBe(
        '[Bébé9] Order SO-1042 paid by a@b.com — €49.90\n#SO-1042\nhttps://silomis.com/admin/shop/orders/abc',
      );
    });

    it('falls back to Silomis when SELLER_NAME is unset', () => {
      delete process.env.SELLER_NAME;
      expect(smsBody({})).toMatch(/^\[Silomis\] /);
    });

    it('drops the link line when APP_URL is unset, so detailUrl arrives null', () => {
      expect(smsBody({ orderNumber: 'SO-1042', detailUrl: null })).toBe('[Silomis] Order SO-1042 paid by a@b.com — €49.90\n#SO-1042');
    });
  });

  describe('getSettings', () => {
    it('hands a never-configured install the defaults, with both channels on', async () => {
      const { service } = makeService();

      expect(await service.getSettings()).toEqual({
        smsEnabled: true,
        smsPhones: [],
        emailEnabled: true,
        emailAddresses: [],
        events: ['payment_succeeded', 'payment_failed', 'order_cancelled', 'support_message'],
      });
    });

    it('respects a stored empty list as a deliberate "none" rather than re-applying the default', async () => {
      const { service } = makeService({ settings: { [ADMIN_NOTIF_KEYS.events]: '' } });

      expect((await service.getSettings()).events).toEqual([]);
    });

    it('drops an event that is no longer part of the contract', async () => {
      const { service } = makeService({ settings: { [ADMIN_NOTIF_KEYS.events]: 'payment_succeeded,order_teleported' } });

      expect((await service.getSettings()).events).toEqual(['payment_succeeded']);
    });
  });

  describe('updateSettings', () => {
    it('strips spaces and rewrites a 00 prefix so the gateway matches the stored string', async () => {
      const { service } = makeService();

      const saved = await service.updateSettings({ smsPhones: ['+33 6 12 34 56 78', '0034 600 000 000'] });

      expect(saved.smsPhones).toEqual(['+33612345678', '+34600000000']);
    });

    it('lower-cases and de-duplicates email addresses', async () => {
      const { service } = makeService();

      expect((await service.updateSettings({ emailAddresses: ['Owner@Shop.test', 'owner@shop.test'] })).emailAddresses).toEqual([
        'owner@shop.test',
      ]);
    });
  });

  describe('resolveRecipients', () => {
    it('returns null for an event that is switched off, so nothing is even logged', async () => {
      const { service } = makeService({ settings: { [ADMIN_NOTIF_KEYS.events]: 'payment_succeeded' } });

      expect(await service.resolveRecipients('order_cancelled')).toBeNull();
    });

    it('falls back to every admin account while the recipient lists are empty', async () => {
      const { service } = makeService({
        admins: [
          { email: 'a@shop.test', phone: '+33600000001' },
          { email: 'b@shop.test', phone: null },
        ],
      });

      expect(await service.resolveRecipients('order_cancelled')).toEqual({
        emails: ['a@shop.test', 'b@shop.test'],
        phones: ['+33600000001'],
      });
    });

    it('uses the configured lists instead of the admins once they are filled in', async () => {
      const { service, prisma } = makeService({
        settings: {
          [ADMIN_NOTIF_KEYS.smsPhones]: '+33611111111',
          [ADMIN_NOTIF_KEYS.emailAddresses]: 'ops@shop.test',
        },
      });

      expect(await service.resolveRecipients('order_cancelled')).toEqual({ emails: ['ops@shop.test'], phones: ['+33611111111'] });
      // No point querying the admin table when neither channel needs the fallback.
      expect(prisma.admin.findMany).not.toHaveBeenCalled();
    });

    it('drops a channel that is switched off', async () => {
      const { service } = makeService({ settings: { [ADMIN_NOTIF_KEYS.smsEnabled]: 'false' } });

      expect(await service.resolveRecipients('order_cancelled')).toEqual({ emails: ['owner@shop.test'], phones: [] });
    });

    it('returns null when both channels are off, rather than an empty fan-out', async () => {
      const { service } = makeService({
        settings: { [ADMIN_NOTIF_KEYS.smsEnabled]: 'false', [ADMIN_NOTIF_KEYS.emailEnabled]: 'false' },
      });

      expect(await service.resolveRecipients('order_cancelled')).toBeNull();
    });

    it('lets a support message through by default — a customer is waiting on it', async () => {
      const { service } = makeService();

      expect(await service.resolveRecipients('support_message')).not.toBeNull();
    });

    it('gates the new fulfilment and low-stock events off until they are ticked', async () => {
      const { service } = makeService();

      expect(await service.resolveRecipients('order_shipped')).toBeNull();
      expect(await service.resolveRecipients('low_stock')).toBeNull();

      await service.updateSettings({ events: ['order_shipped', 'low_stock'] });

      expect(await service.resolveRecipients('order_shipped')).not.toBeNull();
      expect(await service.resolveRecipients('low_stock')).not.toBeNull();
    });
  });
});

describe('CommerceNotificationService.onModuleInit backfill', () => {
  function makeStore(settings: Record<string, string> = {}) {
    const store = new Map(Object.entries(settings));
    const prisma = {
      platformSettings: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          store.has(where.key) ? { key: where.key, value: store.get(where.key)! } : null,
        ),
        findMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) =>
          where.key.in.filter((k) => store.has(k)).map((k) => ({ key: k, value: store.get(k)! })),
        ),
        update: jest.fn(async ({ where, data }: { where: { key: string }; data: { value: string } }) => {
          store.set(where.key, data.value);
          return { key: where.key, value: data.value };
        }),
        upsert: jest.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
          store.set(where.key, create.value);
          return { key: where.key, value: create.value };
        }),
      },
      admin: { findMany: jest.fn(async () => []) },
    };
    const boot = async () => {
      const service = new CommerceNotificationService(prisma as never, null as never, null as never, null as never);
      await service.onModuleInit();
      return service;
    };
    return { store, boot };
  }

  it('adds support_message to a selection saved before the event existed', async () => {
    const { store, boot } = makeStore({ [ADMIN_NOTIF_KEYS.events]: 'payment_succeeded,order_cancelled' });

    await boot();

    expect(store.get(ADMIN_NOTIF_KEYS.events)).toBe('payment_succeeded,order_cancelled,support_message');
  });

  it('never re-adds it after the admin unticks it', async () => {
    const { store, boot } = makeStore({ [ADMIN_NOTIF_KEYS.events]: 'payment_succeeded' });
    await boot();
    store.set(ADMIN_NOTIF_KEYS.events, 'payment_succeeded');

    await boot();

    expect(store.get(ADMIN_NOTIF_KEYS.events)).toBe('payment_succeeded');
  });

  it('leaves a deliberate "no events at all" alone', async () => {
    const { store, boot } = makeStore({ [ADMIN_NOTIF_KEYS.events]: '' });

    await boot();

    expect(store.get(ADMIN_NOTIF_KEYS.events)).toBe('');
  });

  it('touches nothing on a fresh install, where the defaults already cover it', async () => {
    const { store, boot } = makeStore();

    await boot();

    expect(store.has(ADMIN_NOTIF_KEYS.events)).toBe(false);
  });
});
