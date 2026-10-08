import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { ShopEmailService } from '../email/shop-email.service';
import { CheckoutSessionService } from '../checkout/checkout-session.service';
import { CommerceEventBus } from '../commerce-events/commerce-event-bus.service';
import { CustomerSmsService } from '../sms/customer-sms.service';
import { toE164 } from '../common/utils/phone';
import {
  COMMERCE_EVENTS,
  CartAbandonedEvent,
} from '../commerce-events/commerce-events.constants';
import {
  CART_ABANDONMENT_QUEUE,
  CartAbandonmentJobData,
} from './cart-abandonment.constants';

@Processor(CART_ABANDONMENT_QUEUE)
export class CartAbandonmentProcessor extends DlqAwareWorker {
  protected readonly queueName = CART_ABANDONMENT_QUEUE;
  private readonly logger = new Logger(CartAbandonmentProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly prisma: PrismaService,
    private readonly emailService: ShopEmailService,
    private readonly sessionService: CheckoutSessionService,
    private readonly eventBus: CommerceEventBus,
    private readonly customerSms: CustomerSmsService,
  ) {
    super(dlqService);
  }

  async process(job: Job<CartAbandonmentJobData>): Promise<void> {
    const { cartToken } = job.data;

    const cart = await this.prisma.cart.findFirst({
      where: { token: cartToken, status: 'active' },
      include: { items: true },
    });

    if (!cart || cart.items.length === 0) {
      this.logger.log(
        `Cart ${cartToken} is no longer active or has no items — skipping abandonment email`,
      );
      return;
    }

    // Conditional on status still being 'active' — guards against a race
    // where the customer completed checkout between this job firing and now.
    const { count } = await this.prisma.cart.updateMany({
      where: { id: cart.id, status: 'active' },
      data: { status: 'abandoned' },
    });
    if (count === 0) {
      this.logger.log(
        `Cart ${cartToken} was no longer active when abandonment fired — skipping`,
      );
      return;
    }

    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );

    // Resolve customer email + destination URL: prefer an in-progress
    // checkout session (has the freshest email + a proper resume link),
    // fall back to the most recent order created against this cart token.
    let email: string | null = null;
    let name: string | null = null;
    let destinationUrl: string | null = null;
    let locale: string | null = null;
    // The SMS reminder: a number we can dial, and the customer's tick for it.
    // Without the tick there is no text, whatever else is known.
    let phone: string | null = null;
    let smsUrl: string | null = null;

    try {
      const session = await this.sessionService.findByCartToken(cartToken);
      const formSnapshot = session?.formSnapshot as { email?: string; phone?: string; country?: string; smsOptIn?: boolean } | null;
      if (session && !session.completedAt && formSnapshot) {
        const resumeUrl = `${appUrl}/shop/checkout/resume/${session.resumeToken}`;
        if (formSnapshot.email?.trim()) {
          email = formSnapshot.email.trim();
          destinationUrl = resumeUrl;
          locale = session.locale;
        }
        if (formSnapshot.smsOptIn === true && formSnapshot.phone?.trim()) {
          phone = await this.dialable(formSnapshot.phone, formSnapshot.country);
          smsUrl = resumeUrl;
          locale = locale ?? session.locale;
        }
      }
    } catch {
      // Never block the email on session lookup failure — fall through to the order lookup.
    }

    if (!email || !phone) {
      const order = await this.prisma.order.findFirst({
        where: { cartToken },
        orderBy: { createdAt: 'desc' },
      });
      if (!email && order?.customerEmail) {
        email = order.customerEmail;
        name = order.customerName;
        destinationUrl = `${appUrl}/shop/cart/resume/${cartToken}`;
        locale = order.customerLocale;
      }
      if (!phone && order?.smsMarketingOptIn && order.customerPhone?.startsWith('+')) {
        phone = order.customerPhone;
        smsUrl = `${appUrl}/shop/cart/resume/${cartToken}`;
        locale = locale ?? order.customerLocale;
      }
    }

    if (phone && smsUrl) {
      await this.customerSms.sendAbandonedCart(phone, smsUrl, locale, cartToken);
    }

    this.eventBus.emit(
      COMMERCE_EVENTS.CART_ABANDONED,
      {
        cartToken,
        customerEmail: email,
        customerName: name,
      } satisfies CartAbandonedEvent,
      { entityId: cart.id, source: 'CartAbandonmentProcessor.process' },
    );

    if (!email) {
      this.logger.log(
        `Cart ${cartToken} has no resolvable customer email — skipping the email`,
      );
      return;
    }

    await this.emailService.sendAbandonedCart(email, {
      customerName: name ?? 'there',
      resumeUrl: destinationUrl!,
      items: cart.items.map((i) => ({
        title: i.titleSnapshot,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
      })),
      locale,
    });

    this.logger.log(`Abandoned cart email sent for cart ${cartToken}`);
  }

  /** The phone as typed on the form, placed with the form's country. Null when it cannot be dialled. */
  private async dialable(raw: string, country?: string): Promise<string | null> {
    const row = country ? await this.prisma.country.findUnique({ where: { isoCode: country.toUpperCase() }, select: { phonePrefix: true } }) : null;
    return toE164(raw, row?.phonePrefix);
  }
}
