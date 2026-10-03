import { DocumentEmailService } from './document-email.service';
import { htmlToText } from '../email/email-transport.service';
import type { Document } from '../../generated/prisma/client';

/**
 * The receipt, in the customer's own language.
 *
 * It was English-only while the order confirmation that precedes it was not, so
 * a French customer read one letter in French and the next — the one with legal
 * weight — in English. `Document.customerLocale` was already stored; nothing
 * read it.
 */
function doc(over: Partial<Document> = {}): Document {
  return {
    documentType: 'receipt',
    documentNumber: 'REC-2026-0007',
    customerEmail: 'marie@example.com',
    customerName: 'Marie',
    customerLocale: 'fr',
    sellerName: 'Silomis',
    totalCents: 4990,
    issuedAt: new Date('2026-10-03T10:00:00Z'),
    ...over,
  } as Document;
}

/** Captures what would have been sent, without a mail server. */
function makeService() {
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const transport = {
    isConfigured: () => true,
    send: async (to: string, subject: string, html: string) =>
      void sent.push({ to, subject, html }),
  };
  return { service: new DocumentEmailService(transport as never), sent };
}

describe('receipt and invoice email', () => {
  it.each([
    ['fr', 'Votre reçu', 'Bonjour Marie,'],
    ['en', 'Your receipt', 'Hello Marie,'],
    ['es', 'Tu recibo', 'Hola Marie:'],
    ['it', 'La tua ricevuta', 'Ciao Marie,'],
    ['de', 'Deine Quittung', 'Hallo Marie,'],
    ['nl', 'Je bon', 'Hallo Marie,'],
    ['pl', 'Twój paragon', 'Cześć Marie,'],
  ])(
    'writes to a %s customer in %s',
    async (locale, subjectStart, greeting) => {
      const { service, sent } = makeService();
      await service.send(
        doc({ customerLocale: locale }),
        'https://silomis.com/d/abc',
      );
      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toContain(subjectStart);
      expect(htmlToText(sent[0].html)).toContain(greeting);
      expect(sent[0].html).toContain(`<html lang="${locale}"`);
    },
  );

  it('calls an invoice an invoice, not a receipt', async () => {
    const { service, sent } = makeService();
    await service.send(
      doc({ documentType: 'invoice', customerLocale: 'fr' }),
      'https://silomis.com/d/abc',
    );
    expect(sent[0].subject).toContain('Votre facture');
    expect(htmlToText(sent[0].html)).toContain('facture');
  });

  it('falls back to a named customer rather than printing nothing', async () => {
    const { service, sent } = makeService();
    await service.send(
      doc({ customerName: null, customerLocale: 'de' }),
      'https://silomis.com/d/abc',
    );
    const text = htmlToText(sent[0].html);
    expect(text).toContain('Kundin oder Kunde');
    expect(text).not.toMatch(/\bnull\b|\bundefined\b/);
  });

  it('formats the date in the customer’s own convention', async () => {
    const { service, sent } = makeService();
    await service.send(
      doc({ customerLocale: 'de' }),
      'https://silomis.com/d/abc',
    );
    // 3 October 2026 reads as "3. Oktober 2026" in German, not "3 October".
    expect(htmlToText(sent[0].html)).toContain('Oktober');
  });

  it('leaves no undecoded entity and no unrendered value, in any language', async () => {
    for (const locale of ['fr', 'en', 'es', 'it', 'de', 'nl', 'pl']) {
      const { service, sent } = makeService();
      await service.send(
        doc({ customerLocale: locale }),
        'https://silomis.com/d/abc',
      );
      const text = htmlToText(sent[0].html);
      expect(text).not.toMatch(/&[a-z]+;|&#\d+;/i);
      expect(sent[0].html).not.toMatch(/\bundefined\b|NaN\b|\$\{/);
      expect(text).toContain('REC-2026-0007');
      expect(text).toContain('https://silomis.com/d/abc');
    }
  });
});
