import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  ShopCustomer,
  ShopCustomerAddress,
} from '../../generated/prisma/client';
import { UpdateAddressDto, UpsertAddressDto } from './dto/customer.dto';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Called during order creation ────────────────────────────────────────
  // Accepts an optional `tx` so callers already inside their own $transaction
  // (checkout/order creation, payment confirmation) can fold this write into
  // the same atomic unit — same pattern as InventoryService.

  async upsertFromOrder(
    email: string,
    name: string | null,
    phone: string | null,
    userId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<ShopCustomer> {
    const db: Db = tx ?? this.prisma;
    const existing = await db.shopCustomer.findUnique({ where: { email } });
    if (!existing) {
      const [firstName, ...rest] = (name ?? '').split(' ');
      return db.shopCustomer.create({
        data: {
          email,
          firstName: firstName || null,
          lastName: rest.join(' ') || null,
          phone: phone ?? null,
          userId: userId ?? null,
        },
      });
    }
    // Link to a platform user account if not yet linked
    if (userId && !existing.userId) {
      return db.shopCustomer.update({
        where: { id: existing.id },
        data: { userId },
      });
    }
    return existing;
  }

  // ── Called when order ships (update stats) ──────────────────────────────

  async recordOrderCompletion(
    email: string,
    totalCents: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db: Db = tx ?? this.prisma;
    await db.shopCustomer.updateMany({
      where: { email },
      data: {
        totalOrders: { increment: 1 },
        totalSpentCents: { increment: totalCents },
      },
    });
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  findByEmail(email: string) {
    return this.prisma.shopCustomer.findUnique({
      where: { email },
      include: { addresses: true },
    });
  }

  async findById(id: string) {
    const customer = await this.prisma.shopCustomer.findUnique({
      where: { id },
      include: { addresses: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async adminList(search?: string, limit = 20, offset = 0) {
    const where: Prisma.ShopCustomerWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.shopCustomer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.shopCustomer.count({ where }),
    ]);
    return { items, total };
  }

  // ── Addresses ────────────────────────────────────────────────────────────

  async adminListAddresses(search?: string, limit = 20, offset = 0) {
    const where: Prisma.ShopCustomerAddressWhereInput = search
      ? { customer: { email: { contains: search, mode: 'insensitive' } } }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.shopCustomerAddress.findMany({
        where,
        include: {
          customer: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.shopCustomerAddress.count({ where }),
    ]);
    return { items, total };
  }

  async addAddress(
    customerId: string,
    dto: UpsertAddressDto,
  ): Promise<ShopCustomerAddress> {
    const customer = await this.prisma.shopCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.shopCustomerAddress.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }
      return tx.shopCustomerAddress.create({
        data: {
          customerId,
          name: dto.name,
          line1: dto.line1,
          line2: dto.line2 ?? null,
          city: dto.city,
          zip: dto.zip,
          country: dto.country,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async updateAddress(
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<ShopCustomerAddress> {
    const address = await this.prisma.shopCustomerAddress.findUnique({
      where: { id: addressId },
    });
    if (!address) throw new NotFoundException('Address not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.shopCustomerAddress.updateMany({
          where: { customerId: address.customerId },
          data: { isDefault: false },
        });
      }
      return tx.shopCustomerAddress.update({
        where: { id: addressId },
        data: {
          name: dto.name,
          line1: dto.line1,
          line2: dto.line2 !== undefined ? (dto.line2 ?? null) : undefined,
          city: dto.city,
          zip: dto.zip,
          country: dto.country,
          isDefault: dto.isDefault,
        },
      });
    });
  }

  async deleteAddress(addressId: string): Promise<void> {
    await this.prisma.shopCustomerAddress
      .delete({ where: { id: addressId } })
      .catch(() => {});
  }
}
