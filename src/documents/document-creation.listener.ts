import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentService } from './document.service';
import { DocumentInput } from './documents.constants';
import { COMMERCE_EVENTS, PaymentSucceededEvent } from '../commerce-events/commerce-events.constants';
import { TaxService } from '../tax/tax.service';

/**
 * Triggers billing-document creation off PAYMENT_SUCCEEDED, following this
 * project's convention that modules react to commerce events rather than
 * calling each other directly (see commerce-events.constants.ts). This
 * replaces the old synchronous ShopPaymentService -> DocumentService call.
 */
@Injectable()
export class DocumentCreationListener {
  private readonly logger = new Logger(DocumentCreationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentService: DocumentService,
    private readonly taxService: TaxService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      const input = await this.buildOrderDocumentInput(event.orderId, event.paymentIntentId);
      await this.documentService.scheduleCreation(input);
    } catch (err) {
      this.logger.error(`Receipt scheduling failed for order ${event.orderId}: ${(err as Error).message}`);
    }
  }

  // ── Build DocumentInput for the shared documents pipeline ─────────────────
  // (relocated as-is from ShopPaymentService.scheduleReceipt())

  private async buildOrderDocumentInput(orderId: string, paymentIntentId: string): Promise<DocumentInput> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new Error(`Order ${orderId} not found`);

    const sellerAddress: Record<string, string> = {
      line1: process.env.SELLER_ADDRESS_LINE1 ?? '',
      city: process.env.SELLER_ADDRESS_CITY ?? '',
      zip: process.env.SELLER_ADDRESS_ZIP ?? '',
      country: process.env.SELLER_ADDRESS_COUNTRY ?? 'FR',
    };

    const shippingCountry = order.shippingAddressSnapshot ? ((order.shippingAddressSnapshot as Record<string, string>).country ?? null) : null;
    const tax = await this.taxService.resolveRate(shippingCountry, null);

    return {
      entityId: order.id,
      documentType: 'receipt',
      paymentIntentId,
      customer: { email: order.customerEmail, name: order.customerName, companyName: order.customerCompanyName, locale: order.customerLocale },
      seller: { name: process.env.SELLER_NAME ?? '', address: sellerAddress, vatNumber: process.env.SELLER_VAT_NUMBER ?? null, siret: process.env.SELLER_SIRET ?? null },
      financial: {
        subtotalCents: order.subtotalCents,
        deliveryCents: order.shippingCents,
        discountCents: order.discountCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        couponCode: order.couponCode,
      },
      tax: { ratePct: tax.ratePct, country: tax.country },
      deliveryAddress: order.shippingAddressSnapshot as Record<string, string>,
      lines: order.items.map((i, idx) => ({
        description: i.titleSnapshot,
        sku: i.skuSnapshot,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        totalCents: i.totalCents,
        sortOrder: idx,
      })),
    };
  }
}
