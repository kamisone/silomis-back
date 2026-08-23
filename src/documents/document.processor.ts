import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { DocumentService } from './document.service';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentEmailService } from './document-email.service';
import { DOCUMENTS_QUEUE, DocumentCreateJob, DocumentPdfJob, DocumentEmailJob } from './documents.constants';

/**
 * Drives the create → render-pdf → send-email chain for billing documents.
 * Each stage enqueues the next (see DocumentService.schedulePdfRendering /
 * markPdfGenerated) so the whole pipeline runs automatically once a
 * PAYMENT_SUCCEEDED event schedules the initial 'create' job.
 */
@Processor(DOCUMENTS_QUEUE)
export class DocumentProcessor extends DlqAwareWorker {
  protected readonly queueName = DOCUMENTS_QUEUE;
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly documentService: DocumentService,
    private readonly pdfService: DocumentPdfService,
    private readonly emailService: DocumentEmailService,
  ) {
    super(dlqService);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'create':
        return this.handleCreate(job as Job<DocumentCreateJob>);
      case 'render-pdf':
        return this.handleRenderPdf(job as Job<DocumentPdfJob>);
      case 'send-email':
        return this.handleSendEmail(job as Job<DocumentEmailJob>);
      default:
        this.logger.warn(`Unknown document job: ${job.name}`);
    }
  }

  private async handleCreate(job: Job<DocumentCreateJob>): Promise<void> {
    const { input } = job.data;
    if (!input) throw new Error('Missing document input in job data');
    this.logger.log(`Creating document for shop_order ${input.entityId}`);
    try {
      const doc = await this.documentService.createDocument(input);
      await this.documentService.schedulePdfRendering(doc.id);
    } catch (err) {
      this.logger.error(`Document creation failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private async handleRenderPdf(job: Job<DocumentPdfJob>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Rendering PDF for document ${documentId}`);
    try {
      const doc = await this.documentService.findOne(documentId);
      const path = await this.pdfService.generateAndUpload(doc);
      await this.documentService.markPdfGenerated(documentId, path);
    } catch (err) {
      this.logger.error(`PDF render failed for ${documentId}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async handleSendEmail(job: Job<DocumentEmailJob>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Sending email for document ${documentId}`);
    try {
      const doc = await this.documentService.findOne(documentId);
      const downloadUrl = await this.documentService.getDownloadUrl(documentId);
      await this.emailService.send(doc, downloadUrl);
      await this.documentService.markEmailSent(documentId);
    } catch (err) {
      this.logger.error(`Email failed for document ${documentId}: ${(err as Error).message}`);
      throw err;
    }
  }
}
