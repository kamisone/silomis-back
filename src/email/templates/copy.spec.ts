import { COPY, resolveLang } from './copy';
import { renderOrderStatus } from './order-status';
import { renderOrderConfirmed } from './order-confirmed';
import { renderSendInStatus } from './send-in-status';

const LANGS = ['fr', 'en', 'es', 'it', 'de', 'nl', 'pl'] as const;

/** Every key the French copy has, every other language has too — a missing one would render as "undefined" in a customer's inbox. */
function keysOf(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

describe('email copy', () => {
  it('resolves every storefront locale, and falls back to French for anything else', () => {
    for (const l of LANGS) expect(resolveLang(l)).toBe(l);
    expect(resolveLang('de-AT')).toBe('de');
    expect(resolveLang('ja')).toBe('fr');
    expect(resolveLang(null)).toBe('fr');
  });

  it('has the same keys in every language', () => {
    const reference = keysOf(COPY.fr).sort();
    for (const l of LANGS) expect(keysOf(COPY[l]).sort()).toEqual(reference);
  });

  it('writes the whole email in the customer\'s language — subject, greeting and footer included', () => {
    const { subject, html } = renderOrderStatus('shipped', { orderNumber: 'ORD-9', customerName: 'Anna', trackingUrl: null, locale: 'nl' });
    expect(subject).toBe('Bestelling ORD-9 is verzonden');
    expect(html).toContain('Hallo Anna,');
    expect(html).toContain('Alle rechten voorbehouden');
    expect(html).toContain('<html lang="nl"');
    expect(html).not.toContain('All rights reserved');
  });

  it('confirms an order in Polish', () => {
    const { subject, html } = renderOrderConfirmed({
      orderNumber: 'ORD-9', customerName: 'Ola', items: [{ title: 'Czapka', quantity: 1, unitPriceCents: 1000 }],
      subtotalCents: 1000, shippingCents: 0, discountCents: 0, couponCode: null, totalCents: 1000, trackingUrl: null, locale: 'pl',
    });
    expect(subject).toContain('Zamówienie potwierdzone');
    expect(html).toContain('Dzień dobry Ola,');
  });

  it('tells a send-in customer in German that their item has arrived, with the photo', () => {
    const { subject, html } = renderSendInStatus({
      orderNumber: 'ORD-9', customerName: 'Jan', status: 'received', note: null, photoUrls: ['https://x/a.jpg'], trackingUrl: null,
      returnTrackingNumber: null, returnTrackingUrl: null, returnAddress: { name: 'S', line1: '1', zip: '2', city: '3', country: 'FR' }, locale: 'de',
    });
    expect(subject).toBe('Wir haben Ihren Artikel – ORD-9');
    expect(html).toContain('https://x/a.jpg');
    expect(html).toContain('Hallo Jan,');
  });
});
