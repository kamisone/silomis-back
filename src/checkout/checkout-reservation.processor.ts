import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ShopPaymentService } from '../payments/shop-payment.service';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { OrdersService } from '../orders/orders.service';
import { CHECKOUT_RESERVATION_QUEUE, RESERVATION_GRACE_MS, ReservationExpiryJobData } from './checkout-reservation.constants';
import { OrderStatus } from '../../generated/prisma/client';

// Statuses that still hold reserved inventory and can be timed out.
const CANCELLABLE_STATUSES = new Set<OrderStatus>(['draft', 'awaiting_payment']);

@Processor(CHECKOUT_RESERVATION_QUEUE)
export class CheckoutReservationProcessor extends DlqAwareWorker {
  protected readonly queueName = CHECKOUT_RESERVATION_QUEUE;
  private readonly logger = new Logger(CheckoutReservationProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly payment: ShopPaymentService,
  ) {
    super(dlqService);
  }

  async process(job: Job<ReservationExpiryJobData>): Promise<void> {
    const { orderId } = job.data;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    if (!CANCELLABLE_STATUSES.has(order.status)) {
      this.logger.log(`Order ${orderId} is "${order.status}" — no expiry action needed`);
      return;
    }

    const now = new Date();
    if (order.reservationExpiresAt && order.reservationExpiresAt > now) {
      this.logger.log(`Order ${orderId} reservation not yet expired — skipping`);
      return;
    }

    // Before letting stock go, ask Stripe: a card that was authorising as
    // the timer ran out is a sale, not a timeout. `succeeded` has already
    // settled the order by the time this returns; `processing` gets another
    // wait.
    if (order.paymentIntentId) {
      const state = await this.payment.intentState(orderId);
      if (state === 'succeeded') {
        this.logger.log(`Order ${orderId}: paid as the reservation ran out — settled instead of cancelled`);
        return;
      }
      if (state === 'processing') {
        this.logger.log(`Order ${orderId}: payment still in flight — reservation kept for another ${RESERVATION_GRACE_MS / 60_000} min`);
        await this.prisma.order.update({ where: { id: orderId }, data: { reservationExpiresAt: new Date(now.getTime() + RESERVATION_GRACE_MS) } });
        await job.moveToDelayed(Date.now() + RESERVATION_GRACE_MS, job.token);
        return;
      }
    }

    this.logger.log(`Reservation timeout: cancelling ${order.status} order ${orderId}`);
    // transition() handles inventory release + status history.
    await this.ordersService.transition(orderId, 'cancelled', 'Reservation expired — payment timeout');
    this.logger.log(`Order ${orderId} cancelled and inventory released`);
  }
}
