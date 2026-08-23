import { Injectable, Logger } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { GcsService } from '../gcs/gcs.service';
import { Document, DocumentLine } from '../../generated/prisma/client';

type DocumentWithLines = Document & { lines: DocumentLine[] };

// A4 layout (points)
const PAGE_W = 595.28;
const MARGIN = 50;
const COL_W = PAGE_W - 2 * MARGIN;

// Shared palette
const DARK = '#0f172a';
const SLATE = '#334155';
const MUTED = '#64748b';
const LIGHT = '#94a3b8';
const RULE = '#e2e8f0';
const STRIPE = '#f8fafc';

// Invoice-specific
const INV_BAR = '#1e3a5f';
const INV_BG = '#eff6ff';
const INV_FG = '#1e40af';

// Receipt-specific
const REC_BAR = '#1d4c3f';
const REC_BG = '#f0fdf4';
const REC_FG = '#166534';

/**
 * Renders the PDF for a Document (invoice or receipt) and uploads it to GCS.
 * Copy is English-only by product decision — seller business identifiers
 * (SIRET/VAT) are still printed as raw data fields, just with English labels.
 */
@Injectable()
export class DocumentPdfService {
  private readonly logger = new Logger(DocumentPdfService.name);

  constructor(private readonly gcsService: GcsService) {}

  async generateAndUpload(document: DocumentWithLines): Promise<string> {
    const pdf = await this.buildPdf(document);
    const year = (document.issuedAt ?? new Date()).getUTCFullYear();
    const dir = document.documentType === 'invoice' ? 'invoices' : 'receipts';
    const path = `${dir}/${year}/${document.id}.pdf`;
    await this.gcsService.upload(pdf, path, 'application/pdf');
    this.logger.log(`PDF uploaded: ${path}`);
    return path;
  }

  private buildPdf(document: DocumentWithLines): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks as Uint8Array[])));
      doc.on('error', reject);
      this.render(doc, document);
      doc.end();
    });
  }

  private render(doc: PDFKit.PDFDocument, document: DocumentWithLines): void {
    const isInvoice = document.documentType === 'invoice';
    const barColor = isInvoice ? INV_BAR : REC_BAR;
    const bgColor = isInvoice ? INV_BG : REC_BG;
    const fgColor = isInvoice ? INV_FG : REC_FG;
    const title = isInvoice ? 'INVOICE' : 'RECEIPT';

    const addr = document.sellerAddress as Record<string, string>;
    const ship = document.deliveryAddress as Record<string, string> | null;

    const fmt = (cents: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(cents / 100);
    const fmtD = (d: Date | null) =>
      d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : '—';

    let y = MARGIN;

    // ── Top bar ──────────────────────────────────────────────────────────────
    doc.rect(MARGIN, y, COL_W, 4).fill(barColor);
    y += 16;

    doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK).text(title, MARGIN, y);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(`No. ${document.documentNumber ?? '—'}`, PAGE_W - MARGIN - 140, y + 6, { width: 140, align: 'right' })
      .text(`Date: ${fmtD(document.issuedAt)}`, PAGE_W - MARGIN - 140, y + 20, { width: 140, align: 'right' });
    y += 50;

    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 14;

    // ── Seller / Customer columns ──────────────────────────────────────────
    const colW = (COL_W - 20) / 2;
    const cx = MARGIN + colW + 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(MUTED)
      .text('FROM', MARGIN, y)
      .text(isInvoice ? 'CUSTOMER' : 'SHIP TO', cx, y);
    y += 14;

    // Seller
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(document.sellerName, MARGIN, y, { width: colW });
    doc.font('Helvetica').fontSize(9).fillColor(SLATE);
    let sy = y + 14;
    if (addr.line1) {
      doc.text(addr.line1, MARGIN, sy, { width: colW });
      sy += 12;
    }
    const cz = [addr.zip, addr.city].filter(Boolean).join(' ');
    if (cz) {
      doc.text(cz, MARGIN, sy, { width: colW });
      sy += 12;
    }
    if (addr.country) {
      doc.text(addr.country, MARGIN, sy, { width: colW });
      sy += 12;
    }
    if (document.sellerVatNumber) {
      doc.text(`VAT Number: ${document.sellerVatNumber}`, MARGIN, sy, { width: colW });
      sy += 12;
    }
    if (document.sellerSiret) {
      doc.text(`Registration: ${document.sellerSiret}`, MARGIN, sy, { width: colW });
    }

    // Customer / delivery
    const addressBlock = ship ?? null;
    const displayName = document.customerCompanyName ?? addressBlock?.name ?? document.customerName ?? document.customerEmail;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(displayName, cx, y, { width: colW });
    doc.font('Helvetica').fontSize(9).fillColor(SLATE);
    let cy2 = y + 14;
    doc.text(document.customerEmail, cx, cy2, { width: colW });
    cy2 += 12;
    if (addressBlock?.line1) {
      doc.text(addressBlock.line1, cx, cy2, { width: colW });
      cy2 += 12;
    }
    const az = [addressBlock?.zip, addressBlock?.city].filter(Boolean).join(' ');
    if (az) {
      doc.text(az, cx, cy2, { width: colW });
      cy2 += 12;
    }
    if (addressBlock?.country) {
      doc.text(addressBlock.country, cx, cy2, { width: colW });
    }

    y += 80;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 16;

    // ── Reference line ────────────────────────────────────────────────────────
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text('Order Reference: ', MARGIN, y, { continued: true })
      .font('Helvetica-Bold')
      .fillColor(DARK)
      .text(document.entityId);
    y += 24;

    // ── Line items table ──────────────────────────────────────────────────────
    const C = {
      desc: { x: MARGIN, w: COL_W * 0.5 },
      sku: { x: MARGIN + COL_W * 0.5, w: COL_W * 0.12 },
      qty: { x: MARGIN + COL_W * 0.62, w: COL_W * 0.12 },
      unit: { x: MARGIN + COL_W * 0.74, w: COL_W * 0.12 },
      total: { x: MARGIN + COL_W * 0.86, w: COL_W * 0.14 },
    };

    doc.rect(MARGIN, y, COL_W, 20).fill(DARK);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
    doc.text('DESCRIPTION', C.desc.x + 4, y + 6, { width: C.desc.w - 8 });
    doc.text('SKU', C.sku.x + 4, y + 6, { width: C.sku.w - 8 });
    doc.text('QTY', C.qty.x + 4, y + 6, { width: C.qty.w - 8, align: 'center' });
    doc.text('UNIT PRICE', C.unit.x + 4, y + 6, { width: C.unit.w - 8, align: 'right' });
    doc.text('TOTAL', C.total.x + 4, y + 6, { width: C.total.w - 8, align: 'right' });
    y += 20;

    const lines = [...document.lines].sort((a, b) => a.sortOrder - b.sortOrder);
    lines.forEach((line, i) => {
      const h = 22;
      if (i % 2 === 0) doc.rect(MARGIN, y, COL_W, h).fill(STRIPE);
      doc.font('Helvetica').fontSize(9).fillColor(DARK);
      doc.text(line.description, C.desc.x + 4, y + 6, { width: C.desc.w - 8, ellipsis: true });
      doc.text(line.sku ?? '—', C.sku.x + 4, y + 6, { width: C.sku.w - 8 });
      doc.text(String(Number(line.quantity)), C.qty.x + 4, y + 6, { width: C.qty.w - 8, align: 'center' });
      doc.text(fmt(line.unitPriceCents), C.unit.x + 4, y + 6, { width: C.unit.w - 8, align: 'right' });
      doc.fillColor(SLATE).text(fmt(line.totalCents), C.total.x + 4, y + 6, { width: C.total.w - 8, align: 'right' });
      y += h;
    });

    y += 8;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 12;

    // ── Totals ────────────────────────────────────────────────────────────────
    const totX = MARGIN + COL_W * 0.55;
    const totW = COL_W * 0.45;
    const tot = (label: string, cents: number, bold = false) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor(bold ? DARK : SLATE)
        .text(label, totX, y, { width: totW * 0.55 })
        .text(fmt(cents), totX + totW * 0.55, y, { width: totW * 0.45, align: 'right' });
      y += 16;
    };

    tot('Subtotal', document.subtotalCents - document.taxCents);
    if (document.deliveryCents) tot('Shipping', document.deliveryCents);
    if (document.discountCents) tot(`Discount${document.couponCode ? ` (${document.couponCode})` : ''}`, -document.discountCents);
    tot(`${document.taxLabel ?? 'VAT'} (${Number(document.taxRatePct)}%)`, document.taxCents);

    y += 2;
    doc.rect(totX, y, totW, 24).fill(bgColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(fgColor)
      .text('TOTAL', totX + 8, y + 6, { width: totW * 0.55 })
      .text(fmt(document.totalCents), totX + totW * 0.55, y + 6, { width: totW * 0.45 - 8, align: 'right' });
    y += 36;

    // ── Payment notice ────────────────────────────────────────────────────────
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(MUTED)
      .text('Payment received by card via Stripe. This document has been paid in full.', MARGIN, y);
    y += 24;

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 10;
    const footer = [
      document.sellerName,
      document.sellerVatNumber ? `VAT Number: ${document.sellerVatNumber}` : null,
      document.sellerSiret ? `Registration: ${document.sellerSiret}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    doc.font('Helvetica').fontSize(7).fillColor(LIGHT).text(footer, MARGIN, y, { width: COL_W, align: 'center' });
  }
}
