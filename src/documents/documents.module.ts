import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentService } from './document.service';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentEmailService } from './document-email.service';
import { DocumentProcessor } from './document.processor';
import { DocumentCreationListener } from './document-creation.listener';
import { DOCUMENTS_QUEUE } from './documents.constants';
import { GcsModule } from '../gcs/gcs.module';
import { DlqModule } from '../dlq/dlq.module';
import { EmailTransportService } from '../email/email-transport.service';
import { TaxModule } from '../tax/tax.module';

@Module({
  imports: [GcsModule, DlqModule, TaxModule, BullModule.registerQueue({ name: DOCUMENTS_QUEUE })],
  providers: [DocumentService, DocumentPdfService, DocumentEmailService, DocumentProcessor, DocumentCreationListener, EmailTransportService],
  exports: [DocumentService],
})
export class DocumentsModule {}
