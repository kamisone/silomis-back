import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BehaviorTrackingService } from './behavior-tracking.service';
import { COMMERCE_EVENTS, OrderCreatedEvent } from '../commerce-events/commerce-events.constants';

@Injectable()
export class CheckoutStartedListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: BehaviorTrackingService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.ORDER_CREATED)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: event.orderId }, select: { cartToken: true } });
    await this.tracking.record({ eventType: 'checkout_started', cartToken: order?.cartToken ?? null });
  }
}
