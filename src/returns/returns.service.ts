import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ShopPaymentService } from '../payments/shop-payment.service';
import { CreateReturnRequestDto } from './dto/return.dto';
import { ReturnStatus } from '../../generated/prisma/client';

const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['refunded', 'rejected'],
  refunded: ['restocked'],
  rejected: [],
  restocked: [],
};

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly orders: OrdersService,
    private readonly payment: ShopPaymentService,
  ) {}

  // ── List / lookup ────────────────────────────────────────────────────────

  async list(filter: { status?: ReturnStatus; orderId?: string; limit?: number; offset?: number } = {}) {
    const { status, orderId, limit = 20, offset = 0 } = filter;
    const where = {
      ...(status ? { status } : {}),
      ...(orderId ? { orderId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        include: { items: { include: { orderItem: true } }, order: { select: { orderNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } }, order: { select: { orderNumber: true, status: true } } },
    });
    if (!request) throw new NotFoundException('Return request not found');
    return request;
  }

  // ── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateReturnRequestDto) {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found');

    const orderItemsById = new Map(order.items.map((i) => [i.id, i]));
    for (const line of dto.items) {
      const orderItem = orderItemsById.get(line.orderItemId);
      if (!orderItem) throw new BadRequestException(`Order item ${line.orderItemId} does not belong to this order`);

      const alreadyRequested = await this.activeReturnedQuantity(line.orderItemId);
      if (alreadyRequested + line.quantity > orderItem.quantity) {
        throw new BadRequestException(`Return quantity for "${orderItem.titleSnapshot}" exceeds what was ordered (already returning ${alreadyRequested}/${orderItem.quantity})`);
      }
    }

    return this.prisma.returnRequest.create({
      data: {
        orderId: dto.orderId,
        customerEmail: order.customerEmail,
        reason: dto.reason ?? null,
        adminNote: dto.adminNote ?? null,
        restockOnComplete: dto.restockOnComplete ?? true,
        items: { create: dto.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
      },
      include: { items: { include: { orderItem: true } } },
    });
  }

  /** Sum of quantity across every non-rejected return request for this order item — rejected returns don't hold the quantity back. */
  private async activeReturnedQuantity(orderItemId: string): Promise<number> {
    const rows = await this.prisma.returnRequestItem.findMany({
      where: { orderItemId, returnRequest: { status: { not: 'rejected' } } },
      select: { quantity: true },
    });
    return rows.reduce((sum, r) => sum + r.quantity, 0);
  }

  // ── Transition ───────────────────────────────────────────────────────────

  async transition(id: string, toStatus: ReturnStatus, note: string | undefined, adminId: string | undefined) {
    const request = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[request.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`Cannot transition return from "${request.status}" to "${toStatus}"`);
    }
    if (toStatus === 'restocked' && !request.restockOnComplete) {
      throw new BadRequestException('This return was not marked for restocking');
    }

    if (toStatus === 'refunded') {
      return this.doRefund(request, note);
    }
    if (toStatus === 'restocked') {
      return this.doRestock(request, adminId);
    }

    return this.prisma.returnRequest.update({ where: { id }, data: { status: toStatus, adminNote: note ?? request.adminNote } });
  }

  private async doRefund(request: Awaited<ReturnType<ReturnsService['findOne']>>, note?: string) {
    const amountCents = request.items.reduce((sum, i) => sum + i.orderItem.unitPriceCents * i.quantity, 0);
    const refund = await this.payment.refundOrder(request.orderId, amountCents);

    const updated = await this.prisma.returnRequest.update({
      where: { id: request.id },
      data: { status: 'refunded', refundedAmountCents: amountCents, paymentTransactionId: refund.refundId, adminNote: note ?? request.adminNote },
    });

    await this.maybeCloseOrder(request.orderId);
    return updated;
  }

  /** Fully refunds the order only once every unit across every order item has been covered by a refunded/restocked return — a partial return must not flip the whole order to "refunded". */
  private async maybeCloseOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status === 'refunded') return;

    const returnedByItem = new Map<string, number>();
    const rows = await this.prisma.returnRequestItem.findMany({
      where: { returnRequest: { orderId, status: { in: ['refunded', 'restocked'] } } },
      select: { orderItemId: true, quantity: true },
    });
    for (const r of rows) returnedByItem.set(r.orderItemId, (returnedByItem.get(r.orderItemId) ?? 0) + r.quantity);

    const fullyReturned = order.items.every((i) => (returnedByItem.get(i.id) ?? 0) >= i.quantity);
    if (fullyReturned) await this.orders.transition(orderId, 'refunded', 'Fully refunded via returns');
  }

  private async doRestock(request: Awaited<ReturnType<ReturnsService['findOne']>>, adminId?: string) {
    for (const item of request.items) {
      if (item.restocked || !item.orderItem.variantId) continue;
      await this.inventory.restockForReturn(item.orderItem.variantId, item.quantity, request.orderId, request.id, adminId);
      await this.prisma.returnRequestItem.update({ where: { id: item.id }, data: { restocked: true } });
    }
    return this.prisma.returnRequest.update({ where: { id: request.id }, data: { status: 'restocked' }, include: { items: { include: { orderItem: true } } } });
  }
}
