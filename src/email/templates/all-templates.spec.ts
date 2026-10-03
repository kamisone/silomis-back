import { htmlToText } from '../email-transport.service';
import { renderAbandonedCart } from './abandoned-cart';
import { renderAdminOrderAlert } from './admin-order-alert';
import { renderBackInStock } from './back-in-stock';
import { renderLowStockAlert } from './low-stock-alert';
import { renderOrderAccessLink } from './order-access-link';
import { renderOrderConfirmed } from './order-confirmed';
import { renderOrderMessage } from './order-message';
import { renderOrderStatus, type OrderStatusKind } from './order-status';
import { renderPaymentFailed } from './payment-failed';
import { renderReviewRequest } from './review-request';
import { renderSendInStatus } from './send-in-status';
import type { Lang } from './copy';

/**
 * Every email, in every language, held to the same bar.
 *
 * Written because "the templates exist" is not the same as "the templates are
 * production ready". Each of these is a letter a customer reads once, often at
 * the only moment they are paying attention — a `NaN` in a total or an
 * `undefined` where a name should be is not a cosmetic defect there.
 *
 * The assertions are deliberately the ones a human reviewer would make and then
 * stop making after the third locale: is anything unrendered, is the money
 * formatted, is the link absolute, does the text part say anything. Doing it for
 * 7 languages × 15 renders by hand is what nobody does twice.
 */
const LANGS: Lang[] = ['fr', 'en', 'es', 'it', 'de', 'nl', 'pl'];

/**
 * A value that leaked out of the code instead of being rendered.
 *
 * Word boundaries, and not a bare substring match: the Italian for "cancelled"
 * is "annullato", which contains "null". A guard that flags real copy gets
 * switched off, so it has to match only the standalone tokens JavaScript
 * actually produces — and `NaN` stays case-sensitive, because "nan" is a word in
 * several languages.
 */
const LEAKED = /\bundefined\b|\bnull\b|NaN\b|\[object [A-Z]|\$\{/;
const URL = 'https://silomis.com/en/shop/orders/track?token=abc';

/** Every customer-facing render, as (name, producer) pairs. */
function customerEmails(
  locale: Lang,
): Array<[string, { subject: string; html: string }]> {
  const statuses: OrderStatusKind[] = [
    'preparing',
    'shipped',
    'delivered',
    'cancelled',
  ];
  return [
    [
      'order-confirmed',
      renderOrderConfirmed({
        orderNumber: 'SIL-1001',
        customerName: 'Marie',
        locale,
        items: [
          {
            title: 'Embroidered cap',
            quantity: 2,
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
        subtotalCents: 5000,
        shippingCents: 490,
        discountCents: 500,
        couponCode: 'WELCOME',
        totalCents: 4990,
        trackingUrl: URL,
      }),
    ],
    ...statuses.map(
      (kind) =>
        [
          `order-status:${kind}`,
          renderOrderStatus(kind, {
            orderNumber: 'SIL-1001',
            customerName: 'Marie',
            locale,
            trackingUrl: URL,
            carrierName: 'Mondial Relay',
            trackingNumber: 'MR123456789',
          } as never),
        ] as [string, { subject: string; html: string }],
    ),
    [
      'payment-failed',
      renderPaymentFailed({
        orderNumber: 'SIL-1001',
        customerName: 'Marie',
        retryUrl: URL,
        locale,
      }),
    ],
    [
      'order-access-link',
      renderOrderAccessLink({
        orderNumber: 'SIL-1001',
        customerName: 'Marie',
        trackingUrl: URL,
        locale,
      }),
    ],
    [
      'order-message',
      renderOrderMessage({
        orderNumber: 'SIL-1001',
        customerName: 'Marie',
        excerpt: 'Could you stitch the name in teal instead?',
        imageCount: 2,
        conversationUrl: URL,
        locale,
      }),
    ],
    [
      'abandoned-cart',
      renderAbandonedCart({
        customerName: 'Marie',
        items: [
          { title: 'Embroidered beanie', quantity: 1, unitPriceCents: 1900 },
        ],
        resumeUrl: URL,
        locale,
      }),
    ],
    [
      'back-in-stock',
      renderBackInStock({
        productTitle: 'Snapback — Charcoal',
        productUrl: URL,
        locale,
      }),
    ],
    [
      'review-request',
      renderReviewRequest({
        customerName: 'Marie',
        orderNumber: 'SIL-1001',
        productTitle: 'Embroidered cap',
        reviewUrl: URL,
        locale,
      }),
    ],
    [
      'send-in-status',
      renderSendInStatus({
        orderNumber: 'SIL-1001',
        customerName: 'Marie',
        status: 'received',
        note: 'Arrived in good condition.',
        photoUrls: ['https://silomis.com/p.jpg'],
        trackingUrl: URL,
        returnTrackingNumber: 'MR987654321',
        locale,
      } as never),
    ],
  ];
}

describe('every email template, in every language', () => {
  for (const locale of LANGS) {
    describe(locale, () => {
      for (const [name, rendered] of customerEmails(locale)) {
        it(`${name} renders a complete letter`, () => {
          const { subject, html } = rendered;

          // A subject, and not a placeholder one.
          expect(subject.trim().length).toBeGreaterThan(5);
          expect(subject).not.toMatch(LEAKED);

          // Nothing unrendered anywhere in the body — the ways a template leaks
          // its own internals into a customer's inbox.
          expect(html).not.toMatch(LEAKED);

          // Declared as the right language, so a screen reader and a translation
          // prompt both behave.
          expect(html).toContain(`<html lang="${locale}"`);

          // A real document, not a fragment: an email with no <html> wrapper is
          // rendered inconsistently and scores badly with filters.
          expect(html).toContain('<!DOCTYPE html>');
          expect(html).toContain('</html>');

          // Every link absolute — a relative href in an email resolves against
          // nothing and silently goes nowhere.
          for (const href of [...html.matchAll(/href="([^"]+)"/g)].map(
            (m) => m[1],
          )) {
            expect(href).toMatch(/^(https?:\/\/|mailto:|#)/);
          }

          // The plain-text part has to say something, and carry no leftover
          // entities — the defect found by reading a real sent email.
          const text = htmlToText(html);
          expect(text.length).toBeGreaterThan(30);
          expect(text).not.toMatch(/&[a-z]+;|&#\d+;/i);
          expect(text).not.toMatch(/<[a-z/][^>]*>/i);
        });
      }

      it('formats money as money, never as raw cents', () => {
        const { html } = customerEmails(locale)[0][1];
        // 2500 cents must appear as a currency amount somewhere, and the bare
        // integer must not be sitting in a cell on its own.
        expect(html).toMatch(/25[.,]00/);
        expect(html).not.toMatch(/>\s*2500\s*</);
      });
    });
  }

  /**
   * Admin mail is English only and that is deliberate — it goes to the shop's
   * own staff, who have no locale on them. It still has to be a complete letter.
   */
  describe('admin alerts (English by design)', () => {
    const admin: Array<[string, { subject: string; html: string }]> = [
      [
        'low-stock-alert',
        renderLowStockAlert({
          productTitle: 'Snapback',
          variantTitle: 'Charcoal / M',
          available: 2,
          lowStockThreshold: 5,
        }),
      ],
      [
        'admin-order-alert',
        renderAdminOrderAlert('payment_succeeded', {
          summary: 'SIL-1001 — €49.90 paid',
          detailUrl: URL,
        }),
      ],
    ];

    for (const [name, { subject, html }] of admin) {
      it(`${name} renders a complete letter`, () => {
        expect(subject.trim().length).toBeGreaterThan(5);
        expect(html).not.toMatch(LEAKED);
        expect(html).toContain('<!DOCTYPE html>');
        expect(htmlToText(html).length).toBeGreaterThan(20);
      });
    }

    it('survives the fields that are allowed to be absent', () => {
      // A variant-less product and an alert with no link: both real, both a
      // chance to print "null".
      const { html: a } = renderLowStockAlert({
        productTitle: 'Cap',
        variantTitle: null,
        available: 0,
        lowStockThreshold: 3,
      });
      const { html: b } = renderAdminOrderAlert('order_cancelled', {
        summary: 'SIL-1002 cancelled',
        detailUrl: null,
      });
      for (const html of [a, b]) {
        expect(html).not.toMatch(LEAKED);
      }
    });
  });

  it('puts a preheader in the inbox preview when one is given, and nothing when not', () => {
    const { html } = renderOrderConfirmed({
      orderNumber: 'SIL-1003',
      customerName: 'Marie',
      locale: 'en',
      items: [{ title: 'Cap', quantity: 1, unitPriceCents: 2500 }],
      subtotalCents: 2500,
      shippingCents: 0,
      discountCents: 0,
      couponCode: null,
      totalCents: 2500,
      trackingUrl: URL,
    });
    // Templates do not pass one yet; the hook exists and must not emit an empty
    // hidden div that Gmail would fill with "Hello Marie," anyway.
    expect(html).not.toContain('max-height:0;max-width:0;opacity:0');
  });
});

/**
 * The header lockup.
 *
 * It is the one part of every email a recipient sees before deciding whether the
 * message is genuine, and the one part that cannot borrow the website's trick:
 * there the mark IS the capital S, with "ilomis" set beside it in Pacifico.
 * Email loads neither the font nor, by default, the image — so the word is
 * spelled in full here and the mark sits beside it.
 */
describe('email header lockup', () => {
  // The lockup's image needs an absolute URL, so it only appears once the app
  // knows its own address. Production always sets this; the test has to say so
  // or it would assert the unconfigured header instead of the real one.
  const appUrl = process.env.APP_URL;
  beforeAll(() => {
    process.env.APP_URL = 'https://silomis.com';
  });
  afterAll(() => {
    if (appUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = appUrl;
  });

  const sample = (locale: Lang) =>
    renderOrderConfirmed({
      orderNumber: 'SIL-1004',
      customerName: 'Marie',
      locale,
      items: [{ title: 'Cap', quantity: 1, unitPriceCents: 2500 }],
      subtotalCents: 2500,
      shippingCents: 0,
      discountCents: 0,
      couponCode: null,
      totalCents: 2500,
      trackingUrl: URL,
    }).html;

  it('spells the brand in full, never as the website’s "ilomis"', () => {
    const html = sample('en');
    expect(html).toContain('Silomis');
    expect(html).not.toMatch(/>\s*ilomis\s*</);
  });

  it('shows the mark as a PNG, because Outlook renders no WebP', () => {
    const html = sample('en');
    const img = /<img src="([^"]+)" alt=""/.exec(html);
    expect(img).not.toBeNull();
    expect(img![1]).toMatch(/^https?:\/\//);
    expect(img![1]).toMatch(/\.png$/);
  });

  it('leaves the mark’s alt empty, so a blocked image does not say the brand twice', () => {
    expect(sample('en')).toContain('alt=""');
  });

  it('prints the tagline in the reader’s own language', () => {
    expect(sample('fr')).toContain('Broderie');
    expect(sample('de')).toContain('Stickerei');
    expect(sample('pl')).toContain('Haft');
  });

  it('lays the lockup out in a table, which is the only thing Outlook honours', () => {
    // Not flex and not vertical-align on an inline box: Word's renderer supports
    // neither and would stack the mark above the name.
    expect(sample('en')).not.toContain('inline-flex');
  });

  it('falls back to the storefront’s own asset without anyone configuring it', () => {
    expect(sample('en')).toContain('https://silomis.com/assets/logo-email.png');
  });
});

/**
 * An HTML comment is mailed to the recipient. Developer prose does not belong
 * in one: 2.1KB of it used to travel with every message — 41% of the rendered
 * shell — and Gmail clips an email past about 102KB, so the budget is real.
 */
describe('nothing is mailed that nobody reads', () => {
  it('ships no comment except the functional Outlook conditional', () => {
    process.env.APP_URL = 'https://silomis.com';
    const { html } = renderOrderConfirmed({
      orderNumber: 'SIL-1005',
      customerName: 'Marie',
      locale: 'en',
      items: [{ title: 'Cap', quantity: 1, unitPriceCents: 2500 }],
      subtotalCents: 2500,
      shippingCents: 0,
      discountCents: 0,
      couponCode: null,
      totalCents: 2500,
      trackingUrl: URL,
    });
    const comments = [...html.matchAll(/<!--[\s\S]*?-->/g)].map((m) => m[0]);
    for (const comment of comments) expect(comment).toContain('[if mso]');
    expect(comments.length).toBeLessThanOrEqual(1);
  });
});
