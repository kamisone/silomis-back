import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { Cart, CartItem, CartStatus, Prisma } from '../../generated/prisma/client';

const ALL_STATUSES: CartStatus[] = ['active', 'abandoned', 'completed', 'merged'];

@Controller('admin/shop/carts')
export class CartAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
  ) {}

  @Get()
  async list(@Query('status') status?: CartStatus, @Query('productId') productId?: string, @Query('limit') limit = '20', @Query('offset') offset = '0') {
    const where: Prisma.CartWhereInput = {
      ...(status ? { status } : {}),
      ...(productId ? { items: { some: { productId } } } : {}),
    };

    const [ids, total, stats] = await Promise.all([
      this.prisma.cart.findMany({ where, select: { id: true }, orderBy: { updatedAt: 'desc' }, take: Number(limit), skip: Number(offset) }),
      this.prisma.cart.count({ where }),
      this.getStats(),
    ]);

    if (ids.length === 0) return { items: [], total, stats };

    const carts = await this.prisma.cart.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
    });
    return { items: await this.withImageUrls(carts), total, stats };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const cart = await this.prisma.cart.findUnique({ where: { id }, include: { items: true } });
    if (!cart) throw new NotFoundException('Cart not found');
    const [withUrls] = await this.withImageUrls([cart]);
    return withUrls;
  }

  /** Resolves each item's imageKeySnapshot to a displayable URL in one batch call. */
  private async withImageUrls(carts: Array<Cart & { items: CartItem[] }>) {
    const keys = [...new Set(carts.flatMap((c) => c.items.map((i) => i.imageKeySnapshot)).filter((k): k is string => !!k))];
    const urlMap = keys.length ? await this.assetUrls.resolveBatch(keys) : new Map<string, string>();
    return carts.map((c) => ({
      ...c,
      items: c.items.map((i) => ({ ...i, imageUrl: i.imageKeySnapshot ? (urlMap.get(i.imageKeySnapshot) ?? null) : null })),
    }));
  }

  /** Cart counts per status (whole table) + total value sitting in abandoned carts — the "revenue at risk" figure. */
  private async getStats(): Promise<{ byStatus: Record<CartStatus, number>; abandonedValueCents: number }> {
    const counts = await this.prisma.cart.groupBy({ by: ['status'], _count: { id: true } });

    const byStatus = ALL_STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<CartStatus, number>);
    for (const row of counts) byStatus[row.status] = row._count.id;

    const abandonedItems = await this.prisma.cartItem.findMany({
      where: { cart: { status: 'abandoned' } },
      select: { quantity: true, unitPriceCents: true },
    });
    const abandonedValueCents = abandonedItems.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);

    return { byStatus, abandonedValueCents };
  }
}
