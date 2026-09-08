import { CommerceNotificationService, NotifyPayload } from './commerce-notification.service';

/** Only smsBody() is under test — it touches no collaborator. */
function makeService(): CommerceNotificationService {
  return new CommerceNotificationService(null as never, null as never, null as never, null as never);
}

function body(payload: Partial<NotifyPayload>): string {
  const full: NotifyPayload = { event: 'payment_succeeded', summary: 'Order SO-1042 paid by a@b.com — €49.90', ...payload };
  return (makeService() as unknown as { smsBody(p: NotifyPayload): string }).smsBody(full);
}

describe('CommerceNotificationService.smsBody', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('tags the brand, then puts the order number and deep link on their own lines', () => {
    process.env.SELLER_NAME = 'Bébé9';

    expect(body({ orderNumber: 'SO-1042', detailUrl: 'https://silomis.com/admin/shop/orders/abc' })).toBe(
      '[Bébé9] Order SO-1042 paid by a@b.com — €49.90\n#SO-1042\nhttps://silomis.com/admin/shop/orders/abc',
    );
  });

  it('falls back to Silomis when SELLER_NAME is unset', () => {
    delete process.env.SELLER_NAME;

    expect(body({})).toMatch(/^\[Silomis\] /);
  });

  it('drops the link line when APP_URL is unset, so detailUrl arrives null', () => {
    expect(body({ orderNumber: 'SO-1042', detailUrl: null })).toBe(
      '[Silomis] Order SO-1042 paid by a@b.com — €49.90\n#SO-1042',
    );
  });

  it('emits a single line for an event carrying no order', () => {
    expect(body({ summary: 'Something happened' })).toBe('[Silomis] Something happened');
  });
});
