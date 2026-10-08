import { Injectable, Logger } from '@nestjs/common';
import { EmailTransportService } from '../email/email-transport.service';
import {
  baseLayout,
  ctaButton,
  divider,
  mutedText,
  esc,
  fmtCents,
} from '../email/templates/layout';
import { resolveLang, type Lang } from '../email/templates/copy';
import { Document } from '../../generated/prisma/client';

/**
 * The receipt and the invoice, in the customer's own language.
 *
 * This was English-only, on the grounds that it was a product decision — a
 * decision that predated the seven-locale storefront and did not survive it. A
 * French customer received a French order confirmation and then, minutes later,
 * an English receipt: the one document in the whole sequence with legal weight,
 * in a language they had not chosen. `Document.customerLocale` was already being
 * written; nothing read it.
 *
 * `greeting` and `fallbackName` live here rather than in the shared copy table
 * because the shared one keys them per email type, and these two documents are
 * the same letter with one noun changed.
 */
const COPY: Record<Lang, DocCopy> = {
  fr: {
    invoiceSubject: (n, seller) => `Votre facture ${n} – ${seller}`,
    receiptSubject: (n, seller) => `Votre reçu ${n} – ${seller}`,
    greeting: (name) => `Bonjour ${name},`,
    invoiceIntro: 'Merci pour votre commande. Votre facture est disponible.',
    receiptIntro: 'Merci pour votre commande. Votre reçu est disponible.',
    invoiceCta: 'Télécharger ma facture (PDF)',
    receiptCta: 'Télécharger mon reçu (PDF)',
    reference: 'Référence',
    amountPaid: 'Montant réglé',
    date: 'Date',
    linkNote:
      'Ce lien est valable un temps limité. Contactez-nous si vous avez besoin d’une nouvelle copie.',
    fallbackName: 'Client',
  },
  en: {
    invoiceSubject: (n, seller) => `Your invoice ${n} – ${seller}`,
    receiptSubject: (n, seller) => `Your receipt ${n} – ${seller}`,
    greeting: (name) => `Hello ${name},`,
    invoiceIntro: 'Thank you for your order. Your invoice is now available.',
    receiptIntro: 'Thank you for your order. Your receipt is now available.',
    invoiceCta: 'Download my invoice (PDF)',
    receiptCta: 'Download my receipt (PDF)',
    reference: 'Reference',
    amountPaid: 'Amount paid',
    date: 'Date',
    linkNote:
      'This link is valid for a limited time. Contact us if you need a new copy.',
    fallbackName: 'Customer',
  },
  es: {
    invoiceSubject: (n, seller) => `Tu factura ${n} – ${seller}`,
    receiptSubject: (n, seller) => `Tu recibo ${n} – ${seller}`,
    greeting: (name) => `Hola ${name}:`,
    invoiceIntro: 'Gracias por tu pedido. Tu factura ya está disponible.',
    receiptIntro: 'Gracias por tu pedido. Tu recibo ya está disponible.',
    invoiceCta: 'Descargar mi factura (PDF)',
    receiptCta: 'Descargar mi recibo (PDF)',
    reference: 'Referencia',
    amountPaid: 'Importe pagado',
    date: 'Fecha',
    linkNote:
      'Este enlace es válido por tiempo limitado. Escríbenos si necesitas otra copia.',
    fallbackName: 'Cliente',
  },
  it: {
    invoiceSubject: (n, seller) => `La tua fattura ${n} – ${seller}`,
    receiptSubject: (n, seller) => `La tua ricevuta ${n} – ${seller}`,
    greeting: (name) => `Ciao ${name},`,
    invoiceIntro: 'Grazie per il tuo ordine. La tua fattura è ora disponibile.',
    receiptIntro:
      'Grazie per il tuo ordine. La tua ricevuta è ora disponibile.',
    invoiceCta: 'Scarica la mia fattura (PDF)',
    receiptCta: 'Scarica la mia ricevuta (PDF)',
    reference: 'Riferimento',
    amountPaid: 'Importo pagato',
    date: 'Data',
    linkNote:
      'Questo link è valido per un tempo limitato. Scrivici se ti serve una nuova copia.',
    fallbackName: 'Cliente',
  },
  de: {
    invoiceSubject: (n, seller) => `Deine Rechnung ${n} – ${seller}`,
    receiptSubject: (n, seller) => `Deine Quittung ${n} – ${seller}`,
    greeting: (name) => `Hallo ${name},`,
    invoiceIntro:
      'Danke für deine Bestellung. Deine Rechnung steht jetzt bereit.',
    receiptIntro:
      'Danke für deine Bestellung. Deine Quittung steht jetzt bereit.',
    invoiceCta: 'Rechnung herunterladen (PDF)',
    receiptCta: 'Quittung herunterladen (PDF)',
    reference: 'Referenz',
    amountPaid: 'Bezahlter Betrag',
    date: 'Datum',
    linkNote:
      'Dieser Link ist begrenzt gültig. Melde dich, wenn du eine neue Kopie brauchst.',
    fallbackName: 'Kundin oder Kunde',
  },
  nl: {
    invoiceSubject: (n, seller) => `Je factuur ${n} – ${seller}`,
    receiptSubject: (n, seller) => `Je bon ${n} – ${seller}`,
    greeting: (name) => `Hallo ${name},`,
    invoiceIntro: 'Bedankt voor je bestelling. Je factuur staat nu klaar.',
    receiptIntro: 'Bedankt voor je bestelling. Je bon staat nu klaar.',
    invoiceCta: 'Mijn factuur downloaden (PDF)',
    receiptCta: 'Mijn bon downloaden (PDF)',
    reference: 'Referentie',
    amountPaid: 'Betaald bedrag',
    date: 'Datum',
    linkNote:
      'Deze link is beperkt geldig. Laat het ons weten als je een nieuwe kopie nodig hebt.',
    fallbackName: 'Klant',
  },
  pl: {
    invoiceSubject: (n, seller) => `Twoja faktura ${n} – ${seller}`,
    receiptSubject: (n, seller) => `Twój paragon ${n} – ${seller}`,
    greeting: (name) => `Cześć ${name},`,
    invoiceIntro: 'Dziękujemy za zamówienie. Twoja faktura jest już dostępna.',
    receiptIntro: 'Dziękujemy za zamówienie. Twój paragon jest już dostępny.',
    invoiceCta: 'Pobierz fakturę (PDF)',
    receiptCta: 'Pobierz paragon (PDF)',
    reference: 'Numer',
    amountPaid: 'Zapłacona kwota',
    date: 'Data',
    linkNote:
      'Ten link jest ważny przez ograniczony czas. Napisz do nas, jeśli potrzebujesz nowej kopii.',
    fallbackName: 'Klient',
  },
  pt: {
    invoiceSubject: (n, seller) => `A sua fatura ${n} – ${seller}`,
    receiptSubject: (n, seller) => `O seu recibo ${n} – ${seller}`,
    greeting: (name) => `Olá ${name},`,
    invoiceIntro: 'Obrigado pela sua encomenda. A sua fatura já está disponível.',
    receiptIntro: 'Obrigado pela sua encomenda. O seu recibo já está disponível.',
    invoiceCta: 'Descarregar a minha fatura (PDF)',
    receiptCta: 'Descarregar o meu recibo (PDF)',
    reference: 'Referência',
    amountPaid: 'Montante pago',
    date: 'Data',
    linkNote:
      'Este link tem validade limitada. Contacte-nos se precisar de uma nova cópia.',
    fallbackName: 'Cliente',
  },
};

interface DocCopy {
  invoiceSubject: (n: string, seller: string) => string;
  receiptSubject: (n: string, seller: string) => string;
  greeting: (name: string) => string;
  invoiceIntro: string;
  receiptIntro: string;
  invoiceCta: string;
  receiptCta: string;
  reference: string;
  amountPaid: string;
  date: string;
  linkNote: string;
  fallbackName: string;
}

/** The BCP-47 tag for `Intl`, which wants a region to format a date properly. */
const DATE_LOCALE: Record<Lang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  it: 'it-IT',
  de: 'de-DE',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-PT',
};

@Injectable()
export class DocumentEmailService {
  private readonly logger = new Logger(DocumentEmailService.name);

  constructor(private readonly transport: EmailTransportService) {}

  async send(document: Document, downloadUrl: string): Promise<void> {
    const lang = resolveLang(document.customerLocale);
    const copy = COPY[lang];
    const isInvoice = document.documentType === 'invoice';
    const name = esc(document.customerName?.trim() || copy.fallbackName);
    const num = esc(document.documentNumber ?? '—');
    const date = document.issuedAt
      ? new Intl.DateTimeFormat(DATE_LOCALE[lang], {
          dateStyle: 'long',
          timeZone: 'UTC',
        }).format(document.issuedAt)
      : '—';

    const body = `
      <p style="margin:0 0 6px;font-size:15px;">${esc(copy.greeting(name))}</p>
      <p style="margin:0 0 20px;font-size:15px;">${isInvoice ? copy.invoiceIntro : copy.receiptIntro}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin:0 0 8px;">
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">${copy.reference}</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${num}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">${copy.amountPaid}</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${esc(fmtCents(document.totalCents))}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;">${copy.date}</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;">${esc(date)}</td>
        </tr>
      </table>

      ${ctaButton(isInvoice ? copy.invoiceCta : copy.receiptCta, downloadUrl)}

      ${divider()}
      ${mutedText(copy.linkNote)}
    `;

    const subject = isInvoice
      ? copy.invoiceSubject(num, document.sellerName)
      : copy.receiptSubject(num, document.sellerName);
    // The locale reaches the layout too, so the footer is in the same language
    // as the letter above it.
    const html = baseLayout(subject, body, document.customerLocale);

    if (!document.customerEmail) return;
    await this.transport.send(document.customerEmail, subject, html);
    this.logger.log(
      `Document email sent to ${document.customerEmail} (${num}) [${lang}]`,
    );
  }
}
