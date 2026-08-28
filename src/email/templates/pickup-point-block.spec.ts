import { pickupPointBlock, PickupPointEmailData } from './pickup-point-block';
import { renderOrderStatus } from './order-status';

const POINT: PickupPointEmailData = {
  id: 'FR-012345',
  name: 'Tabac de la Gare',
  address: '12 rue de la Gare',
  postcode: '77820',
  city: 'Le Châtelet-en-Brie',
  country: 'FR',
  type: 'relay',
  openingHours: [
    { weekday: 1, slots: ['09:00-12:30', '14:00-19:00'] },
    { weekday: 2, slots: ['09:00-19:00'] },
    { weekday: 3, slots: [] },
    { weekday: 4, slots: ['09:00-19:00'] },
    { weekday: 5, slots: ['09:00-18:00'] },
    { weekday: 6, slots: ['09:00-13:00'] },
    { weekday: 7, slots: [] },
  ],
};

describe('pickupPointBlock', () => {
  it('names the point, its address and its carrier reference', () => {
    const html = pickupPointBlock(POINT, 'fr');

    expect(html).toContain('Tabac de la Gare');
    expect(html).toContain('12 rue de la Gare');
    expect(html).toContain('77820');
    expect(html).toContain('Le Châtelet-en-Brie');
    // The reference is what a customer quotes when asking the shop about it.
    expect(html).toContain('FR-012345');
  });

  it('renders all seven days, marking closed ones', () => {
    const html = pickupPointBlock(POINT, 'fr');

    for (const day of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']) {
      expect(html).toContain(day);
    }
    expect(html).toContain('Fermé');
    expect(html).toContain('09:00-12:30 · 14:00-19:00');
  });

  it('translates to the order locale', () => {
    const html = pickupPointBlock(POINT, 'en');

    expect(html).toContain('Your pickup point');
    expect(html).toContain('Monday');
    expect(html).toContain('Closed');
  });

  it('omits the hours table when the carrier gave none', () => {
    const html = pickupPointBlock({ ...POINT, openingHours: null }, 'en');

    expect(html).toContain('Tabac de la Gare');
    expect(html).not.toContain('Opening hours');
  });

  it('escapes the carrier-supplied text', () => {
    const html = pickupPointBlock({ ...POINT, name: '<script>alert(1)</script>' }, 'en');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('order-status email', () => {
  it('tells a shipped customer where to collect', () => {
    const { html } = renderOrderStatus('shipped', {
      orderNumber: 'ORD-000123',
      customerName: 'Alex',
      trackingUrl: null,
      pickupPoint: POINT,
      locale: 'fr',
    });

    expect(html).toContain('Tabac de la Gare');
    expect(html).toContain('FR-012345');
  });

  it('leaves the block out of a home-delivery order', () => {
    const { html } = renderOrderStatus('shipped', {
      orderNumber: 'ORD-000123',
      customerName: 'Alex',
      trackingUrl: null,
      pickupPoint: null,
      locale: 'fr',
    });

    expect(html).not.toContain('point de retrait');
  });

  it('does not point a cancelled order at a collection address', () => {
    const { html } = renderOrderStatus('cancelled', {
      orderNumber: 'ORD-000123',
      customerName: 'Alex',
      trackingUrl: null,
      pickupPoint: POINT,
      locale: 'fr',
    });

    expect(html).not.toContain('Tabac de la Gare');
  });
});
