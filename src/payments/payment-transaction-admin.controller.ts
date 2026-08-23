import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShopPaymentService } from './shop-payment.service';
import { PaymentTransactionStatus, PaymentTransactionType, Prisma } from '../../generated/prisma/client';

@Controller('admin/shop/transactions')
export class PaymentTransactionAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payment: ShopPaymentService,
  ) {}

  @Post(':orderId/refund')
  refund(@Param('orderId') orderId: string, @Body('amountCents') amountCents?: number) {
    return this.payment.refundOrder(orderId, amountCents);
  }

  @Get()
  async list(@Query('type') type?: PaymentTransactionType, @Query('status') status?: PaymentTransactionStatus, @Query('orderId') orderId?: string, @Query('limit') limit = '50', @Query('offset') offset = '0') {
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(orderId ? { orderId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);
    return { items, total };
  }

  /** Groups transactions by the Stripe webhook event that produced them — surfaces duplicate/replayed deliveries at a glance. */
  @Get('stripe-events')
  async stripeEvents(@Query('limit') limit = '50', @Query('offset') offset = '0') {
    const items = await this.prisma.paymentTransaction.groupBy({
      by: ['webhookEventId', 'orderId', 'status'],
      where: { webhookEventId: { not: null } },
      _max: { createdAt: true },
      _count: { id: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });
    return {
      items: items.map((r) => ({
        webhookEventId: r.webhookEventId,
        orderId: r.orderId,
        status: r.status,
        createdAt: r._max.createdAt,
        count: r._count.id,
      })),
    };
  }
}
