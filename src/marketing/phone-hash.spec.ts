import { createHash } from 'crypto';
import { MetaCapiService } from './meta-capi/meta-capi.service';
import { TikTokEventsService } from './tiktok-events/tiktok-events.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * The two platforms want the phone hashed from different strings — Meta from
 * the digits alone, TikTok from the E.164 form with its "+". A wrong format
 * still hashes to something, so a mistake here fails silently as unmatched
 * conversions; this pins both.
 */
describe('phone hashing for ad-platform matching', () => {
  beforeAll(() => {
    process.env.META_CAPI_ACCESS_TOKEN = 'x';
    process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN = 'x';
  });

  function queue() {
    return { add: jest.fn().mockResolvedValue({}) };
  }
  const settings = {
    getMetaPixelConfig: () => ({ pixelId: 'p', enabled: true }),
    getTikTokPixelConfig: () => ({ pixelId: 'p', enabled: true }),
  };
  const base = { eventId: 'e', eventSourceUrl: 'u', customData: {}, properties: {} };

  it('Meta: digits with country code, no plus', async () => {
    const q = queue();
    await new MetaCapiService(q as never, settings as never).sendEvent({ ...base, eventName: 'Purchase', phone: '+33612345678' });
    expect(q.add.mock.calls[0][1].customerPhoneHash).toBe(sha('33612345678'));
  });

  it('TikTok: the E.164 string', async () => {
    const q = queue();
    await new TikTokEventsService(q as never, settings as never).sendEvent({ ...base, eventName: 'Purchase', phone: '+33612345678' } as never);
    expect(q.add.mock.calls[0][1].customerPhoneHash).toBe(sha('+33612345678'));
  });

  it('sends no phone hash for a number that never got its country code', async () => {
    const q = queue();
    await new MetaCapiService(q as never, settings as never).sendEvent({ ...base, eventName: 'Purchase', phone: '0612345678' });
    expect(q.add.mock.calls[0][1].customerPhoneHash).toBeNull();
  });
});
