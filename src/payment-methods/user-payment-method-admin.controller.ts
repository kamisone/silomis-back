import { Controller, Delete, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethodStatus, Prisma } from '../../generated/prisma/client';

/**
 * Faithful port of the reference schema's shape — read-only admin browse +
 * delete, same as the reference project itself. There is no real
 * SetupIntent/attach/detach Stripe flow behind this in either project; the
 * table is never actually populated by a save-card action today.
 */
@Controller('admin/shop/payment-methods')
export class UserPaymentMethodAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('customerId') customerId?: string, @Query('status') status?: PaymentMethodStatus, @Query('limit') limit = '20', @Query('offset') offset = '0') {
    const where: Prisma.UserPaymentMethodWhereInput = {
      ...(customerId ? { customerId } : {}),
      ...(status ? { status } : {}),
    };
    return this.prisma.$transaction([this.prisma.userPaymentMethod.findMany({ where, include: { paymentType: true, billingAddress: true }, orderBy: { createdAt: 'desc' }, take: parseInt(limit, 10), skip: parseInt(offset, 10) }), this.prisma.userPaymentMethod.count({ where })]).then(([items, total]) => ({ items, total }));
  }

  @Get('customer/:customerId')
  listByCustomer(@Param('customerId') customerId: string) {
    return this.prisma.userPaymentMethod.findMany({
      where: { customerId },
      include: { paymentType: true, billingAddress: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Query('value') status: PaymentMethodStatus) {
    return this.prisma.userPaymentMethod.update({ where: { id }, data: { status } });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.prisma.userPaymentMethod.delete({ where: { id } });
  }
}
