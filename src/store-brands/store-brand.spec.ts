import { statementSuffix } from '../payments/shop-payment.service';
import { baseLayout } from '../email/templates/layout';

describe('statementSuffix', () => {
  it('keeps what a bank statement can print', () => {
    expect(statementSuffix('Brew Mini')).toBe('BREW MINI');
    expect(statementSuffix('Café "Prêt"')).toBe('CAFE PRET');
  });

  it('stays short enough to follow the account prefix', () => {
    expect(
      statementSuffix('The Very Long Coffee Company')!.length,
    ).toBeLessThanOrEqual(12);
  });

  it('gives up on a name with no letters', () => {
    expect(statementSuffix('123 ***')).toBeNull();
  });
});

describe('baseLayout under a store brand', () => {
  const brand = {
    name: 'BrewMini',
    tagline: null,
    logoUrl: 'https://cdn.test/icon.png',
    supportEmail: null,
  };

  it('names the brand and uses its icon, never the Silomis mark or tagline', () => {
    process.env.APP_URL = 'https://silomis.com';
    const html = baseLayout(
      'Order confirmed',
      '<p>Hi</p>',
      'en',
      undefined,
      brand,
    );
    expect(html).toContain('BrewMini');
    expect(html).toContain('https://cdn.test/icon.png');
    expect(html).not.toContain('logo-email.png');
    expect(html).not.toContain('Embroidery');
    expect(html).not.toContain('Silomis');
  });

  it('shows the name alone when the brand has no icon', () => {
    const html = baseLayout('Order confirmed', '<p>Hi</p>', 'en', undefined, {
      ...brand,
      logoUrl: null,
    });
    expect(html).not.toContain('<img');
  });
});
