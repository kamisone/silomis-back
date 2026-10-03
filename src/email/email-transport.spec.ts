import { htmlToText } from './email-transport.service';
import { renderOrderConfirmed } from './templates/order-confirmed';

/**
 * Every email carries a plain-text alternative beside the HTML.
 *
 * Two reasons it has to be right rather than merely present: spam filters mark
 * HTML-only mail down, and a client that shows the text part would otherwise
 * show an empty message. The hard requirement is that link addresses survive —
 * a text part reading "Track your order" with no URL is worse than none.
 */
describe('plain-text alternative', () => {
  it('keeps a link’s address beside its label', () => {
    expect(
      htmlToText('<a href="https://silomis.com/orders/1">Track your order</a>'),
    ).toBe('Track your order (https://silomis.com/orders/1)');
  });

  it('does not repeat the address when the label already is one', () => {
    expect(
      htmlToText('<a href="https://silomis.com">https://silomis.com</a>'),
    ).toBe('https://silomis.com');
  });

  it('drops the stylesheet rather than reading it out', () => {
    const text = htmlToText(
      '<head><style>.x{color:red}</style></head><p>Hello</p>',
    );
    expect(text).toBe('Hello');
    expect(text).not.toContain('color');
  });

  it('separates blocks, and bullets one per line', () => {
    const text = htmlToText(
      '<p>One</p><p>Two</p><ul><li>a</li><li>b</li></ul>',
    );
    expect(text.split('\n').filter(Boolean)).toEqual([
      'One',
      'Two',
      '- a',
      '- b',
    ]);
    // A blank line before the list is correct in text; two in a row are not.
    expect(text).not.toMatch(/\n{3,}/);
  });

  it('decodes entities after stripping, so escaped markup stays visible', () => {
    expect(htmlToText('<p>Tom &amp; Amy</p>')).toBe('Tom & Amy');
    expect(htmlToText('<p>&lt;p&gt; is a tag</p>')).toBe('<p> is a tag');
  });

  /**
   * The templates print the customer's embroidery text as `&ldquo;…&rdquo;` and
   * join the embroidery line with `&middot;`. A decoder that knew only the five
   * XML entities left those verbatim, so a text-only client showed the customer
   * `&ldquo;SILOMIS&rdquo;`. Found by reading a real sent email.
   */
  it('decodes the typographic entities the templates actually use', () => {
    expect(htmlToText('<p>&ldquo;SILOMIS&rdquo;</p>')).toBe(
      '\u201cSILOMIS\u201d',
    );
    expect(htmlToText('<p>Front panel &middot; 15 mm</p>')).toBe(
      'Front panel \u00b7 15 mm',
    );
    expect(htmlToText('<p>&euro;25.00 &mdash; 2&times;</p>')).toBe(
      '\u20ac25.00 \u2014 2\u00d7',
    );
  });

  it('decodes numeric entities, decimal and hex', () => {
    expect(htmlToText('<p>&#8220;a&#8221; &#x2014; b</p>')).toBe(
      '\u201ca\u201d \u2014 b',
    );
  });

  it('leaves an entity it does not know rather than deleting it', () => {
    // Visible and fixable beats silently dropped.
    expect(htmlToText('<p>&notanentity; here</p>')).toBe('&notanentity; here');
  });

  it('leaves no undecoded entity in a real order confirmation', () => {
    const { html } = renderOrderConfirmed({
      orderNumber: 'SIL-1002',
      locale: 'en',
      customerName: 'Mohamed',
      items: [
        {
          title: 'Embroidered cap',
          quantity: 1,
          unitPriceCents: 2500,
          personalizations: [
            {
              placementLabel: 'Front panel',
              contentType: 'text',
              text: 'SILOMIS',
              motifName: null,
              motifSizeMm: null,
              fontName: 'Block Classic',
              heightMm: 15,
              threadNames: ['Madeira Polyneon 1791 Teal'],
            },
          ],
        },
      ],
      subtotalCents: 2500,
      shippingCents: 0,
      discountCents: 0,
      couponCode: null,
      totalCents: 2500,
      trackingUrl: 'https://silomis.com/en/shop/orders/track?token=t',
    });
    expect(htmlToText(html)).not.toMatch(/&[a-z]+;|&#\d+;/i);
  });

  it('collapses the blank space a table-based layout leaves behind', () => {
    expect(
      htmlToText('<table><tr><td>  A  </td></tr><tr><td>B</td></tr></table>'),
    ).toBe('A\nB');
  });

  /** The real thing, not a fixture: whatever layout.ts actually produces. */
  it('turns a real order confirmation into something a person could read', () => {
    const { html } = renderOrderConfirmed({
      orderNumber: 'SIL-1001',
      locale: 'en',
      customerName: 'Marie',
      items: [{ title: 'Embroidered cap', quantity: 1, unitPriceCents: 2500 }],
      subtotalCents: 2500,
      shippingCents: 0,
      discountCents: 0,
      couponCode: null,
      totalCents: 2500,
      trackingUrl: 'https://silomis.com/en/shop/orders/track?token=abc',
    });

    const text = htmlToText(html);
    expect(text).toContain('SIL-1001');
    expect(text).toContain(
      'https://silomis.com/en/shop/orders/track?token=abc',
    );
    // No markup, and no run of blank lines where the table scaffolding was.
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).not.toMatch(/\n{3,}/);
    expect(text.length).toBeGreaterThan(40);
  });
});
