import { DocumentType } from '../../generated/prisma/client';

export const DOCUMENTS_QUEUE = 'documents';

export interface DocumentLineInput {
  description: string;
  sku?: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  sortOrder?: number;
}

export interface DocumentInput {
  entityId: string;
  documentType: DocumentType;
  paymentIntentId: string | null;
  customer: { email: string; name: string | null; companyName?: string | null; locale?: string };
  seller: { name: string; address: Record<string, string>; vatNumber?: string | null; siret?: string | null };
  financial: {
    subtotalCents: number;
    deliveryCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
    couponCode?: string | null;
  };
  tax: { ratePct: number; label?: string | null; country?: string };
  deliveryAddress?: Record<string, string> | null;
  contextSnapshot?: Record<string, unknown> | null;
  lines: DocumentLineInput[];
}

// ── BullMQ job payloads ─────────────────────────────────────────────────

export interface DocumentCreateJob {
  input: DocumentInput;
}

export interface DocumentPdfJob {
  documentId: string;
}

export interface DocumentEmailJob {
  documentId: string;
}
