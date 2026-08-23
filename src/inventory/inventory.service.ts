import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { CommerceEventBus } from '../commerce-events/commerce-event-bus.service';
import { COMMERCE_EVENTS } from '../commerce-events/commerce-events.constants';
import { InventoryItem, InventoryMovementType, Prisma } from '../../generated/prisma/client';

export interface EnrichedInventoryItem {
  id: string;
  variantId: string;
  productId: string;
  sku: string;
  variantTitle: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  featuredMediaUrl: string | null;
  optionValues: Array<{ optionValueId: string; value: string; displayValue: string | null; attributeName: string; attributeId: string }>;
  productTitle: string;
  productSlug: string;
  productStatus: string;
  available: number;
  reserved: number;
  committed: number;
  incoming: number;
  lowStockThreshold: number;
  updatedAt: Date;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

interface EnrichedRow {
  id: string;
  variantId: string;
  productId: string;
  available: number;
  reserved: number;
  committed: number;
  incoming: number;
  lowStockThreshold: number;
  updatedAt: Date;
  sku: string;
  variantTitle: string;
  priceCents: bigint | number | null;
  compareAtPriceCents: bigint | number | null;
  variantMediaKey: string | null;
  productTitle: string;
  productSlug: string;
  productStatus: string;
  productImageKey: string | null;
}

interface OptionRow {
  variantId: string;
  optionValueId: string;
  value: string;
  displayValue: string | null;
  attributeName: string;
  attributeId: string;
}

/** Either the root PrismaService or a transaction client handed down by a caller — same model delegates either way. */
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrl: AssetUrlService,
    private readonly eventBus: CommerceEventBus,
  ) {}

  getByVariant(variantId: string): Promise<InventoryItem | null> {
    return this.prisma.inventoryItem.findUnique({ where: { variantId } });
  }

  listAll(): Promise<InventoryItem[]> {
    return this.prisma.inventoryItem.findMany();
  }

  // ── Enriched list (for admin inventory page) ────────────────────────────

  async listAllEnriched(): Promise<EnrichedInventoryItem[]> {
    const rows = await this.prisma.$queryRaw<EnrichedRow[]>`
      SELECT
        inv.id,
        inv."variantId",
        inv."productId",
        inv.available,
        inv.reserved,
        inv.committed,
        inv.incoming,
        inv."lowStockThreshold",
        inv."updatedAt",
        v.sku,
        v.title AS "variantTitle",
        COALESCE(v."priceCents", p."basePriceCents") AS "priceCents",
        v."compareAtPriceCents",
        v."featuredMediaKey" AS "variantMediaKey",
        p.title AS "productTitle",
        p.slug AS "productSlug",
        p.status AS "productStatus",
        p."featuredImageKey" AS "productImageKey"
      FROM shop_inventory_items inv
      JOIN shop_product_variants v ON v.id = inv."variantId"
      JOIN shop_products p ON p.id = inv."productId"
      WHERE p."deletedAt" IS NULL
        AND v."combinationHash" IS NOT NULL
      ORDER BY p.title ASC, v."sortOrder" ASC, v.title ASC
    `;

    if (!rows.length) return [];

    const variantIds = rows.map((r) => r.variantId);
    const optionRows = await this.prisma.$queryRaw<OptionRow[]>`
      SELECT
        vo."variantId",
        ov.id AS "optionValueId",
        ov.value,
        ov."displayValue",
        attr.name AS "attributeName",
        attr.id AS "attributeId"
      FROM shop_variant_options vo
      JOIN shop_variation_option_values ov ON ov.id = vo."optionValueId"
      JOIN shop_variant_attributes attr ON attr.id = vo."attributeId"
      WHERE vo."variantId" IN (${Prisma.join(variantIds)})
        AND vo."optionValueId" IS NOT NULL
      ORDER BY attr."sortOrder" ASC
    `;

    const optsByVariant = new Map<string, OptionRow[]>();
    for (const ov of optionRows) {
      const arr = optsByVariant.get(ov.variantId) ?? [];
      arr.push(ov);
      optsByVariant.set(ov.variantId, arr);
    }

    const mediaKeys = [...rows.map((r) => r.variantMediaKey).filter(Boolean), ...rows.map((r) => r.productImageKey).filter(Boolean)] as string[];
    const urlMap = await this.assetUrl.resolveBatch(mediaKeys);

    return rows.map((r) => {
      const available = Number(r.available ?? 0);
      const threshold = Number(r.lowStockThreshold ?? 5);
      const mediaUrl = r.variantMediaKey ? (urlMap.get(r.variantMediaKey) ?? null) : r.productImageKey ? (urlMap.get(r.productImageKey) ?? null) : null;

      return {
        id: r.id,
        variantId: r.variantId,
        productId: r.productId,
        sku: r.sku,
        variantTitle: r.variantTitle,
        priceCents: Number(r.priceCents ?? 0),
        compareAtPriceCents: r.compareAtPriceCents ? Number(r.compareAtPriceCents) : null,
        featuredMediaUrl: mediaUrl,
        optionValues: (optsByVariant.get(r.variantId) ?? []).map((o) => ({
          optionValueId: o.optionValueId,
          value: o.value,
          displayValue: o.displayValue,
          attributeName: o.attributeName,
          attributeId: o.attributeId,
        })),
        productTitle: r.productTitle,
        productSlug: r.productSlug,
        productStatus: r.productStatus,
        available,
        reserved: Number(r.reserved ?? 0),
        committed: Number(r.committed ?? 0),
        incoming: Number(r.incoming ?? 0),
        lowStockThreshold: threshold,
        updatedAt: r.updatedAt,
        status: available <= 0 ? 'out_of_stock' : available <= threshold ? 'low_stock' : 'in_stock',
      };
    });
  }

  // ── Update inventory settings ────────────────────────────────────────────

  async updateSettings(variantId: string, dto: { lowStockThreshold?: number; incoming?: number }): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { variantId } });
    if (!item) throw new NotFoundException(`Inventory record not found for variant ${variantId}`);
    return this.prisma.inventoryItem.update({ where: { variantId }, data: dto });
  }

  // ── Bulk adjust ───────────────────────────────────────────────────────

  async bulkAdjust(adjustments: Array<{ variantId: string; delta: number; note?: string }>, adminId?: string): Promise<{ ok: number; failed: number }> {
    let ok = 0;
    let failed = 0;
    for (const adj of adjustments) {
      try {
        await this.adjust(adj.variantId, adj.delta, adj.note ?? 'Bulk adjustment', adminId);
        ok++;
      } catch (err) {
        failed++;
        this.logger.warn(`Bulk adjust failed for ${adj.variantId}: ${(err as Error).message}`);
      }
    }
    return { ok, failed };
  }

  // ── Reserve stock when an order is placed ────────────────────────────────
  // Atomic conditional UPDATE (WHERE available >= quantity) rather than a
  // SELECT-then-UPDATE: Postgres serializes concurrent UPDATEs against the
  // same row, so two requests racing to reserve the last unit can never both
  // succeed — a find-then-save pattern has exactly that race window.
  //
  // Every mutation method here accepts an optional `tx`: when a caller (e.g.
  // OrdersService.transition) is already inside its own $transaction and
  // passes its client through, the movement runs as part of that same
  // transaction instead of opening a new one — so an order's status change
  // and its inventory bucket movement commit or roll back together. Called
  // standalone (no tx), each method still wraps itself for atomicity.

  async reserveForOrder(variantId: string, quantity: number, orderId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (db: Db) => {
      const claim = await db.inventoryItem.updateMany({
        where: { variantId, available: { gte: quantity } },
        data: { available: { decrement: quantity }, reserved: { increment: quantity } },
      });

      if (claim.count === 0) {
        const item = await db.inventoryItem.findUnique({ where: { variantId } });
        if (!item) throw new NotFoundException(`Inventory record not found for variant ${variantId}`);
        throw new BadRequestException(`Insufficient stock: ${item.available} available, ${quantity} requested`);
      }

      const item = await db.inventoryItem.findUniqueOrThrow({ where: { variantId } });
      await db.inventoryMovement.create({
        data: {
          variantId,
          orderId,
          type: 'order_placed',
          delta: -quantity,
          availableAfter: item.available,
          reservedAfter: item.reserved,
          committedAfter: item.committed,
          note: `Reserved ${quantity} units for order`,
        },
      });
    };

    if (tx) await run(tx);
    else await this.prisma.$transaction(run);

    this.eventBus.emit(COMMERCE_EVENTS.INVENTORY_RESERVED, { variantId, orderId, quantity }, { entityId: orderId, source: 'InventoryService.reserveForOrder' });

    // Purely additive low-stock check — a separate, cheap read after the
    // reservation above has already committed. No "before" snapshot is
    // available on this path, so this approximates a crossing check: only
    // fires while still in stock, so it doesn't re-alert on every order once
    // a variant has hit zero. A small race window under concurrent orders
    // (possible missed/duplicate alert) is accepted — alerting is best-effort
    // and must never affect reservation atomicity above.
    try {
      const current = await this.prisma.inventoryItem.findUnique({ where: { variantId } });
      if (current && current.available > 0 && current.available <= current.lowStockThreshold) {
        this.eventBus.emit(COMMERCE_EVENTS.INVENTORY_LOW_STOCK, { productId: current.productId, variantId, available: current.available, lowStockThreshold: current.lowStockThreshold }, { entityId: current.productId, source: 'InventoryService.reserveForOrder' });
      }
    } catch (err) {
      this.logger.warn(`Low stock check failed for variant ${variantId}: ${(err as Error).message}`);
    }
  }

  // ── Release reserve when order is cancelled ──────────────────────────────

  async releaseForOrder(variantId: string, quantity: number, orderId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (db: Db) => {
      const rows = await db.$queryRaw<Array<{ available: number; reserved: number; committed: number }>>`
        UPDATE shop_inventory_items
        SET reserved = GREATEST(0, reserved - ${quantity}), available = available + ${quantity}, "updatedAt" = now()
        WHERE "variantId" = ${variantId}
        RETURNING available, reserved, committed
      `;
      const item = rows[0];
      if (!item) return;

      await db.inventoryMovement.create({
        data: {
          variantId,
          orderId,
          type: 'order_cancelled',
          delta: quantity,
          availableAfter: item.available,
          reservedAfter: item.reserved,
          committedAfter: item.committed,
          note: `Released ${quantity} reserved units (order cancelled)`,
        },
      });
    };

    if (tx) await run(tx);
    else await this.prisma.$transaction(run);

    this.eventBus.emit(COMMERCE_EVENTS.INVENTORY_RELEASED, { variantId, orderId, quantity }, { entityId: orderId, source: 'InventoryService.releaseForOrder' });
  }

  // ── Commit reserve → committed when order is paid ────────────────────────
  // Moves stock from "Reserved" (held for an unpaid order, subject to the
  // checkout reservation expiry) into "Committed" (held for a paid order,
  // awaiting fulfillment — no longer subject to expiry).

  async commitForOrder(variantId: string, quantity: number, orderId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (db: Db) => {
      const rows = await db.$queryRaw<Array<{ available: number; reserved: number; committed: number }>>`
        UPDATE shop_inventory_items
        SET reserved = GREATEST(0, reserved - ${quantity}), committed = committed + ${quantity}, "updatedAt" = now()
        WHERE "variantId" = ${variantId}
        RETURNING available, reserved, committed
      `;
      const item = rows[0];
      if (!item) return;

      await db.inventoryMovement.create({
        data: {
          variantId,
          orderId,
          type: 'order_paid',
          delta: 0,
          availableAfter: item.available,
          reservedAfter: item.reserved,
          committedAfter: item.committed,
          note: `Committed ${quantity} units (order paid)`,
        },
      });
    };

    if (tx) await run(tx);
    else await this.prisma.$transaction(run);
  }

  // ── Release committed stock when a paid order is cancelled/refunded ─────
  // Units move from "Committed" back to "Available" — used when an order is
  // cancelled/refunded after payment but before shipment.

  async releaseCommittedForOrder(variantId: string, quantity: number, orderId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (db: Db) => {
      const rows = await db.$queryRaw<Array<{ available: number; reserved: number; committed: number }>>`
        UPDATE shop_inventory_items
        SET committed = GREATEST(0, committed - ${quantity}), available = available + ${quantity}, "updatedAt" = now()
        WHERE "variantId" = ${variantId}
        RETURNING available, reserved, committed
      `;
      const item = rows[0];
      if (!item) return;

      await db.inventoryMovement.create({
        data: {
          variantId,
          orderId,
          type: 'order_refunded',
          delta: quantity,
          availableAfter: item.available,
          reservedAfter: item.reserved,
          committedAfter: item.committed,
          note: `Released ${quantity} committed units (paid order cancelled/refunded)`,
        },
      });
    };

    if (tx) await run(tx);
    else await this.prisma.$transaction(run);

    this.eventBus.emit(COMMERCE_EVENTS.INVENTORY_RELEASED, { variantId, orderId, quantity }, { entityId: orderId, source: 'InventoryService.releaseCommittedForOrder' });
  }

  // ── Commit → sold when order ships ───────────────────────────────────────

  async confirmSale(variantId: string, quantity: number, orderId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (db: Db) => {
      const rows = await db.$queryRaw<Array<{ available: number; reserved: number; committed: number }>>`
        UPDATE shop_inventory_items
        SET committed = GREATEST(0, committed - ${quantity}), "updatedAt" = now()
        WHERE "variantId" = ${variantId}
        RETURNING available, reserved, committed
      `;
      const item = rows[0];
      if (!item) return;

      await db.inventoryMovement.create({
        data: {
          variantId,
          orderId,
          type: 'order_shipped',
          delta: -quantity,
          availableAfter: item.available,
          reservedAfter: item.reserved,
          committedAfter: item.committed,
          note: `Confirmed sale of ${quantity} units`,
        },
      });
    };

    if (tx) await run(tx);
    else await this.prisma.$transaction(run);
  }

  // ── Return restocking ────────────────────────────────────────────────────

  async restockForReturn(variantId: string, quantity: number, orderId: string, returnRequestId: string, adminId?: string, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (db: Db) => {
      const before = await db.inventoryItem.findUnique({ where: { variantId } });
      if (!before) return;

      const rows = await db.$queryRaw<Array<{ available: number; reserved: number; committed: number }>>`
        UPDATE shop_inventory_items
        SET available = available + ${quantity}, "updatedAt" = now()
        WHERE "variantId" = ${variantId}
        RETURNING available, reserved, committed
      `;
      const item = rows[0];
      if (!item) return;

      await db.inventoryMovement.create({
        data: {
          variantId,
          orderId,
          adminId: adminId ?? null,
          type: 'restock',
          delta: quantity,
          availableAfter: item.available,
          reservedAfter: item.reserved,
          committedAfter: item.committed,
          note: `Restocked ${quantity} units from return ${returnRequestId}`,
        },
      });

      if (before.available === 0 && item.available > 0) {
        this.eventBus.emit(COMMERCE_EVENTS.INVENTORY_RESTOCKED, { productId: before.productId, variantId, newAvailable: item.available }, { entityId: before.productId, source: 'InventoryService.restockForReturn' });
      }
    };

    if (tx) await run(tx);
    else await this.prisma.$transaction(run);
  }

  // ── Manual adjustment ────────────────────────────────────────────────────

  async adjust(variantId: string, delta: number, note: string, adminId?: string): Promise<InventoryItem> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.inventoryItem.findUnique({ where: { variantId } });
      if (!before) throw new NotFoundException(`Inventory record not found for variant ${variantId}`);

      const claim = await tx.inventoryItem.updateMany({
        where: { variantId, ...(delta < 0 ? { available: { gte: -delta } } : {}) },
        data: { available: { increment: delta } },
      });
      if (claim.count === 0) throw new BadRequestException('Adjustment would result in negative stock');

      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { variantId } });
      await tx.inventoryMovement.create({
        data: {
          variantId,
          orderId: null,
          adminId: adminId ?? null,
          type: 'manual_adjustment' as InventoryMovementType,
          delta,
          availableAfter: item.available,
          reservedAfter: item.reserved,
          committedAfter: item.committed,
          note,
        },
      });

      if (before.available === 0 && item.available > 0) {
        this.eventBus.emit(COMMERCE_EVENTS.INVENTORY_RESTOCKED, { productId: item.productId, variantId, newAvailable: item.available }, { entityId: item.productId, source: 'InventoryService.adjust' });
      }

      if (before.available > before.lowStockThreshold && item.available > 0 && item.available <= item.lowStockThreshold) {
        this.eventBus.emit(COMMERCE_EVENTS.INVENTORY_LOW_STOCK, { productId: item.productId, variantId, available: item.available, lowStockThreshold: item.lowStockThreshold }, { entityId: item.productId, source: 'InventoryService.adjust' });
      }

      return item;
    });
  }

  getMovements(variantId: string) {
    return this.prisma.inventoryMovement.findMany({ where: { variantId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
}
