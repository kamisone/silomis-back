import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { ShopEmailService } from '../email/shop-email.service';
import { CheckoutSessionService } from '../checkout/checkout-session.service';
import { CommerceEventBus } from '../commerce-events/commerce-event-bus.service';
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

    try {
      const session = await this.sessionService.findByCartToken(cartToken);
      const formSnapshot = session?.formSnapshot as { email?: string } | null;
      if (session && !session.completedAt && formSnapshot?.email) {
        email = formSnapshot.email;
        destinationUrl = `${appUrl}/shop/checkout/resume/${session.resumeToken}`;
        locale = session.locale;
      }
    } catch {
      // Never block the email on session lookup failure — fall through to the order lookup.
    }

    if (!email) {
      const order = await this.prisma.order.findFirst({
        where: { cartToken },
        orderBy: { createdAt: 'desc' },
      });
      if (order?.customerEmail) {
        email = order.customerEmail;
        name = order.customerName;
        destinationUrl = `${appUrl}/shop/cart/resume/${cartToken}`;
        locale = order.customerLocale;
      }
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
        `Cart ${cartToken} has no resolvable customer email — skipping`,
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
}
