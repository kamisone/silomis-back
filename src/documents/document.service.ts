import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { Document, DocumentLine, DocumentStatus, Prisma } from '../../generated/prisma/client';
import { DOCUMENTS_QUEUE, DocumentInput, DocumentCreateJob, DocumentPdfJob, DocumentEmailJob } from './documents.constants';

export type { DocumentLineInput, DocumentInput } from './documents.constants';

/**
 * Creates and tracks the lifecycle of billing documents (invoices/receipts
 * for shop orders). Document numbers are drawn from dedicated Postgres
 * sequences (invoice_number_seq / shop_receipt_seq — see migration
 * 20260822111850_document_number_sequences) so they are gap-free and
 * monotonically increasing even under concurrent order completion.
 *
 * Creation, PDF rendering and email delivery form one automatic BullMQ
 * pipeline: scheduleCreation -> 'create' job -> createDocument() ->
 * schedulePdfRendering -> 'render-pdf' job -> markPdfGenerated() ->
 * 'send-email' job -> markEmailSent(). See DocumentProcessor for the worker
 * that drives each stage.
 */
@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrlService: AssetUrlService,
    @InjectQueue(DOCUMENTS_QUEUE) private readonly queue: Queue,
  ) {}

  // ── Entry point: enqueue document creation ────────────────────────────────

  async scheduleCreation(input: DocumentInput): Promise<void> {
    const jobId = `doc-create-shop_order-${input.entityId}`;
    await this.queue.add('create', { input } satisfies DocumentCreateJob, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
    });
    this.logger.log(`Document creation queued for shop_order ${input.entityId}`);
  }

  async createDocument(input: DocumentInput): Promise<Document> {
    // Idempotency: if a document already exists for this entity, return it
    const existing = await this.prisma.document.findFirst({
      where: { entityType: 'shop_order', entityId: input.entityId },
    });
    if (existing) {
      this.logger.debug(`Document already exists for shop_order ${input.entityId} — skipping`);
      return existing;
    }

    const seq = input.documentType === 'invoice' ? 'invoice_number_seq' : 'shop_receipt_seq';
    const prefix = input.documentType === 'invoice' ? 'INV' : 'REC';

    return this.prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('${seq}') AS nextval`);
      const year = new Date().getUTCFullYear();
      const documentNumber = `${prefix}-${year}-${String(nextval).padStart(6, '0')}`;

      const doc = await tx.document.create({
        data: {
          documentType: input.documentType,
          entityType: 'shop_order',
          entityId: input.entityId,
          documentNumber,
          paymentIntentId: input.paymentIntentId,
          status: 'issued',
          issuedAt: new Date(),

          customerEmail: input.customer.email,
          customerName: input.customer.name ?? null,
          customerCompanyName: input.customer.companyName ?? null,
          customerLocale: input.customer.locale ?? 'fr',

          sellerName: input.seller.name,
          sellerAddress: input.seller.address,
          sellerVatNumber: input.seller.vatNumber ?? null,
          sellerSiret: input.seller.siret ?? null,

          deliveryAddress: input.deliveryAddress ?? undefined,
          contextSnapshot: input.contextSnapshot as Prisma.InputJsonValue | undefined,

          subtotalCents: input.financial.subtotalCents,
          deliveryCents: input.financial.deliveryCents,
          discountCents: input.financial.discountCents,
          taxCents: input.financial.taxCents,
          totalCents: input.financial.totalCents,
          couponCode: input.financial.couponCode ?? null,

          taxRatePct: input.tax.ratePct,
          taxLabel: input.tax.label ?? null,
          taxCountry: input.tax.country ?? 'FR',

          lines: {
            create: input.lines.map((l, i) => ({
              description: l.description,
              sku: l.sku ?? null,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              totalCents: l.totalCents,
              periodStart: l.periodStart ? new Date(l.periodStart) : null,
              periodEnd: l.periodEnd ? new Date(l.periodEnd) : null,
              sortOrder: l.sortOrder ?? i,
            })),
          },
        },
      });

      this.logger.log(`Document ${documentNumber} created (id=${doc.id})`);
      return doc;
    });
  }

  // ── Schedule PDF rendering after record is created ────────────────────────

  async schedulePdfRendering(documentId: string): Promise<void> {
    await this.queue.add(
      'render-pdf',
      { documentId } satisfies DocumentPdfJob,
      { jobId: `doc-pdf-${documentId}`, attempts: 3, backoff: { type: 'exponential', delay: 15_000 } },
    );
  }

  async markPdfGenerated(documentId: string, storagePath: string): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { pdfStoragePath: storagePath, pdfGeneratedAt: new Date() },
    });
    await this.queue.add(
      'send-email',
      { documentId } satisfies DocumentEmailJob,
      { jobId: `doc-email-${documentId}`, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  }

  async markEmailSent(documentId: string): Promise<void> {
    await this.prisma.document.update({ where: { id: documentId }, data: { emailSentAt: new Date() } });
  }

  async voidDocument(documentId: string): Promise<Document> {
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    if (doc.status === 'void') return doc;
    return this.prisma.document.update({ where: { id: documentId }, data: { status: 'void' } });
  }

  async findOne(documentId: string): Promise<Document & { lines: DocumentLine[] }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return doc;
  }

  findAll(filter: { status?: DocumentStatus; limit?: number; offset?: number } = {}): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { entityType: 'shop_order', ...(filter.status ? { status: filter.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
      skip: filter.offset,
    });
  }

  async getDownloadUrl(documentId: string): Promise<string> {
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    if (!doc.pdfStoragePath) throw new Error('PDF not yet generated');
    return this.assetUrlService.resolve(doc.pdfStoragePath);
  }
}
