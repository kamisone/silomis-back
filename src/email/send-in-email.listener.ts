import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { ShopEmailService } from './shop-email.service';
import { COMMERCE_EVENTS, SendInStatusChangedEvent } from '../commerce-events/commerce-events.constants';

/**
 * Tells the customer each time their item moves. The photographs the shop
 * attached to the step ride along — public media-library keys, so the links
 * never expire in someone's inbox.
 */
@Injectable()
export class SendInEmailListener {
  private readonly logger = new Logger(SendInEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly email: ShopEmailService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.SEND_IN_STATUS_CHANGED)
  async onStatusChanged(event: SendInStatusChangedEvent): Promise<void> {
    try {
      const [job, step] = await Promise.all([
        this.prisma.sendInJob.findUnique({ where: { id: event.jobId }, include: { order: true } }),
        this.prisma.sendInEvent.findUnique({ where: { id: event.eventId } }),
      ]);
      if (!job || !step) return;
      // A note or a photo without a status change is a timeline entry, not a
      // reason to write; the customer hears about it on their next visit.
      if (event.fromStatus === event.toStatus) return;

      const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
      const trackingUrl = job.order.trackingToken ? `${appUrl}/shop/orders/track/${job.order.orderNumber}?token=${job.order.trackingToken}` : null;
      const urls = await this.assetUrls.resolveBatch(step.photoKeys);

      await this.email.sendSendInStatus(job.order.customerEmail, {
        orderNumber: job.order.orderNumber,
        customerName: job.order.customerName ?? job.order.customerEmail,
        status: job.status,
        note: step.note,
        photoUrls: step.photoKeys.map((k) => urls.get(k) ?? '').filter(Boolean),
        trackingUrl,
        returnTrackingNumber: job.returnTrackingNumber,
        returnTrackingUrl: job.returnTrackingUrl,
        returnAddress: {
          name: process.env.SELLER_NAME ?? 'Silomis',
          line1: process.env.SELLER_ADDRESS_LINE1 ?? '',
          zip: process.env.SELLER_ADDRESS_ZIP ?? '',
          city: process.env.SELLER_ADDRESS_CITY ?? '',
          country: process.env.SELLER_ADDRESS_COUNTRY ?? 'FR',
        },
        locale: job.order.customerLocale,
      });
    } catch (err) {
      this.logger.error(`Send-in email failed for job ${event.jobId}: ${(err as Error).message}`);
    }
  }
}
