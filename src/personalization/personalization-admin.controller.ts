import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { OrderStatus, Prisma } from '../../generated/prisma/client';
import { PersonalizationService } from './personalization.service';
import { parseLocalized } from './localized.util';

/** Order in which the floor works a job. Anything else is rejected. */
const PRODUCTION_STATUSES = ['pending', 'digitizing', 'ready', 'stitched'] as const;
type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

/**
 * Only a paid order is a job. A draft is a checkout someone may never finish,
 * an awaiting_payment order is a card that may still be declined, and a
 * cancelled or refunded one is a cap nobody is paying for — none of them
 * belong in front of an operator, who would otherwise digitise, and possibly
 * stitch, work that has no customer.
 */
const PRODUCTION_ORDER_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

const JOB_INCLUDE = {
  orderItem: {
    select: {
      id: true,
      quantity: true,
      titleSnapshot: true,
      skuSnapshot: true,
      optionsSnapshot: true,
      order: { select: { id: true, orderNumber: true, status: true, createdAt: true, customerName: true } },
    },
  },
} satisfies Prisma.OrderItemPersonalizationInclude;

type JobRow = Prisma.OrderItemPersonalizationGetPayload<{ include: typeof JOB_INCLUDE }>;

/**
 * One job as the floor sees it. Everything here was frozen at order time —
 * nothing re-reads the live catalogue, because a thread retired last week
 * must not change a job already on the floor. The production SVG is left
 * out: it is large, and the list never needs it.
 */
function toJob(r: JobRow) {
  return {
    id: r.id,
    orderId: r.orderItem.order.id,
    orderItemId: r.orderItem.id,
    orderNumber: r.orderItem.order.orderNumber,
    orderStatus: r.orderItem.order.status,
    orderedAt: r.orderItem.order.createdAt,
    customerName: r.orderItem.order.customerName,
    productTitle: r.orderItem.titleSnapshot,
    sku: r.orderItem.skuSnapshot,
    options: (r.orderItem.optionsSnapshot as { attributeName: string; value: string; displayValue: string | null }[] | null) ?? [],
    quantity: r.orderItem.quantity,
    placementKey: r.placementKey,
    placementLabel: r.placementLabel,
    contentType: r.contentType,
    text: r.text,
    fontName: r.fontName,
    fontWeight: r.fontWeight,
    heightMm: r.heightMm,
    fieldWidthMm: r.fieldWidthMm,
    fieldHeightMm: r.fieldHeightMm,
    offsetXMm: r.offsetXMm,
    offsetYMm: r.offsetYMm,
    rotationDeg: r.rotationDeg,
    lineCount: r.lineCount,
    curveDeg: r.curveDeg,
    trackingPct: r.trackingPct,
    hasOutline: r.hasOutline,
    outlineThread: r.outlineThread,
    isPuff: r.isPuff,
    motifKey: r.motifKey,
    motifName: r.motifName,
    motifSizeMm: r.motifSizeMm,
    threadColors: r.threadColors,
    stitchEstimate: r.stitchEstimate,
    priceCents: r.priceCents,
    productionStatus: r.productionStatus,
    productionNote: r.productionNote,
    stitchFileKey: r.stitchFileKey,
    digitizedAt: r.digitizedAt,
    hasArtwork: r.productionSvg != null,
    updatedAt: r.updatedAt,
  };
}

/**
 * The production queue.
 *
 * This is the screen an operator lives in, so it answers the questions asked
 * at a machine rather than the ones asked at a desk: what is waiting, what
 * exactly gets sewn, on what, and in which threads.
 */
@Controller('admin/shop/personalization')
export class PersonalizationAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly personalization: PersonalizationService,
  ) {}

  @Get('queue')
  async queue(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const paidOnly: Prisma.OrderItemPersonalizationWhereInput = {
      orderItem: { order: { status: { in: PRODUCTION_ORDER_STATUSES } } },
    };
    const searchFilter: Prisma.OrderItemPersonalizationWhereInput = search
      ? {
          OR: [
            { text: { contains: search, mode: 'insensitive' } },
            { orderItem: { order: { orderNumber: { contains: search, mode: 'insensitive' } } } },
            { orderItem: { order: { customerName: { contains: search, mode: 'insensitive' } } } },
            { orderItem: { titleSnapshot: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};
    const where: Prisma.OrderItemPersonalizationWhereInput = {
      AND: [paidOnly, searchFilter, status && status !== 'all' ? { productionStatus: status } : {}],
    };

    const [rows, total, counts, unpaidJobs] = await Promise.all([
      this.prisma.orderItemPersonalization.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: Math.min(Number(limit) || 50, 200),
        skip: Number(offset) || 0,
        include: JOB_INCLUDE,
      }),
      this.prisma.orderItemPersonalization.count({ where }),
      // Counts follow the search but not the tab, so the strip says how much
      // of *this* search sits in each state.
      this.prisma.orderItemPersonalization.groupBy({
        by: ['productionStatus'],
        where: { AND: [paidOnly, searchFilter] },
        _count: { _all: true },
      }),
      // Jobs on orders still waiting for a card to clear. Not work yet — but
      // an operator wondering where a customer's job went deserves the answer.
      this.prisma.orderItemPersonalization.count({
        where: { AND: [{ orderItem: { order: { status: { in: ['draft', 'pending', 'awaiting_payment'] } } } }, searchFilter] },
      }),
    ]);

    return {
      total,
      unpaidJobs,
      // Every status is present even at zero, so the tab strip does not
      // reflow as the queue drains.
      counts: Object.fromEntries(
        PRODUCTION_STATUSES.map((s) => [s, counts.find((c) => c.productionStatus === s)?._count._all ?? 0]),
      ),
      items: rows.map(toJob),
    };
  }

  /**
   * Every job on one order, for the order page. Unlike the queue this does
   * not hide unpaid or cancelled orders: someone looking at a cancelled order
   * still needs to see what was going to be embroidered on it.
   */
  @Get('orders/:orderId/jobs')
  async jobsForOrder(@Param('orderId') orderId: string) {
    const rows = await this.prisma.orderItemPersonalization.findMany({
      where: { orderItem: { orderId } },
      orderBy: [{ orderItem: { createdAt: 'asc' } }, { placementKey: 'asc' }],
      include: JOB_INCLUDE,
    });
    return { items: rows.map(toJob) };
  }

  /**
   * The production SVG on its own — it is large, so the list never carries it.
   *
   * A row without one (a render that failed at checkout, or a design older
   * than the renderer) is rebuilt here from the frozen design and saved, so
   * the operator never has to know it was missing.
   */
  @Get('queue/:id/artwork')
  async artwork(@Param('id') id: string) {
    const row = await this.prisma.orderItemPersonalization.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Design not found');

    let productionSvg = row.productionSvg;
    if (!productionSvg) {
      const built = await this.personalization.buildArtworkForCartItems([{ id: row.orderItemId, personalizations: [row] }]);
      productionSvg = built.get(`${row.orderItemId}:${row.placementKey}`) ?? null;
      if (productionSvg) {
        await this.prisma.orderItemPersonalization.update({ where: { id }, data: { productionSvg } });
      }
    }

    return {
      productionSvg,
      text: row.text,
      placementLabel: row.placementLabel,
      heightMm: row.heightMm,
      threadColors: row.threadColors,
      stitchEstimate: row.stitchEstimate,
    };
  }

  @Patch('queue/:id')
  async update(
    @Param('id') id: string,
    @Body() body: { productionStatus?: string; productionNote?: string | null; stitchFileKey?: string | null },
  ) {
    const data: Prisma.OrderItemPersonalizationUpdateInput = {};

    if (body.productionStatus !== undefined) {
      if (!PRODUCTION_STATUSES.includes(body.productionStatus as ProductionStatus)) {
        throw new BadRequestException(`Status must be one of: ${PRODUCTION_STATUSES.join(', ')}`);
      }
      data.productionStatus = body.productionStatus;
    }
    if (body.productionNote !== undefined) {
      const note = body.productionNote?.trim() ?? '';
      if (note.length > 2000) throw new BadRequestException('Note is too long (2000 characters max).');
      data.productionNote = note || null;
    }
    if (body.stitchFileKey !== undefined) {
      const key = body.stitchFileKey?.trim() ?? '';
      if (key.length > 1000) throw new BadRequestException('Stitch file reference is too long.');
      data.stitchFileKey = key || null;
      // Arriving stitch file is what "digitised" means; stamping it here keeps
      // the two from drifting apart the way a separate button would let them.
      data.digitizedAt = key ? new Date() : null;
    }

    const updated = await this.prisma.orderItemPersonalization.update({ where: { id }, data, include: JOB_INCLUDE });
    return toJob(updated);
  }

  /** Catalogue readout — what the editor is currently offering. */
  @Get('catalog')
  async catalog() {
    const [templates, fonts, threads] = await Promise.all([
      // Positions are per product now, so they are not part of the shop-wide
      // readout — the studio fetches them for whichever product is open.
      this.prisma.personalizationTemplate.findMany({
        include: {
          priceBands: { orderBy: { maxStitches: 'asc' } },
          _count: { select: { products: true } },
        },
      }),
      this.prisma.embroideryFont.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.threadColor.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    return { templates, fonts, threads };
  }

  // ── Price bands ──────────────────────────────────────────────────────
  // Shop-wide, and the least visible setting in the whole feature: the largest
  // band is also the hard ceiling, so a shop that adds outline and puff without
  // raising it will start refusing designs that fit the panel easily.

  @Get('templates')
  async listTemplates() {
    return this.prisma.personalizationTemplate.findMany({
      orderBy: { key: 'asc' },
      include: { priceBands: { orderBy: { maxStitches: 'asc' } } },
    });
  }

  /**
   * Replaces the whole ladder at once.
   *
   * A band only means anything relative to the ones either side of it, so they
   * are edited as a set rather than one at a time — there is no coherent
   * intermediate state where a shop has deleted the middle band and not yet
   * decided what replaces it.
   */
  @Put('templates/:id/bands')
  async saveBands(@Param('id') templateId: string, @Body() body: { bands?: { maxStitches: number; priceCents: number; label?: string | null }[] }) {
    const bands = body.bands ?? [];
    if (!bands.length) throw new BadRequestException('There has to be at least one price band.');

    for (const b of bands) {
      if (!Number.isFinite(b.maxStitches) || b.maxStitches <= 0) {
        throw new BadRequestException('Every band needs a stitch limit above zero.');
      }
      if (!Number.isFinite(b.priceCents) || b.priceCents < 0) {
        throw new BadRequestException('Every band needs a price.');
      }
    }

    const limits = bands.map((b) => Math.round(b.maxStitches));
    if (new Set(limits).size !== limits.length) {
      throw new BadRequestException('Two bands cannot share the same stitch limit.');
    }

    // Replace inside a transaction: a half-written ladder would price designs
    // wrongly for however long it lasted.
    await this.prisma.$transaction([
      this.prisma.personalizationPriceBand.deleteMany({ where: { templateId } }),
      this.prisma.personalizationPriceBand.createMany({
        data: bands.map((b) => ({
          templateId,
          maxStitches: Math.round(b.maxStitches),
          priceCents: Math.round(b.priceCents),
          label: b.label?.trim() || null,
        })),
      }),
    ]);

    return this.prisma.personalizationPriceBand.findMany({ where: { templateId }, orderBy: { maxStitches: 'asc' } });
  }

  // ── Thread colours ───────────────────────────────────────────────────
  // A shop can only stitch what is on its wall, so this is the list of spools
  // it actually holds. The code is what an operator reads off the cone, which
  // is why it is a required field and not a nicety — a hex value alone cannot
  // be bought.

  @Get('threads')
  listThreads() {
    return this.prisma.threadColor.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  @Post('threads')
  async createThread(@Body() body: ThreadBody) {
    const data = this.threadData(body, true);
    const count = await this.prisma.threadColor.count();

    try {
      return await this.prisma.threadColor.create({
        data: { ...(data as Required<ReturnType<typeof this.threadData>>), sortOrder: body.sortOrder ?? count * 10 },
      });
    } catch (err) {
      // The (brand, code) pair is unique — the same spool added twice is a
      // mistake worth naming rather than a generic 500.
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException(`${data.brand} ${data.code} is already on the list.`);
      }
      throw err;
    }
  }

  @Patch('threads/:id')
  async updateThread(@Param('id') id: string, @Body() body: ThreadBody) {
    try {
      return await this.prisma.threadColor.update({ where: { id }, data: this.threadData(body, false) });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Another spool already uses that brand and code.');
      }
      throw err;
    }
  }

  /**
   * Removes a spool from the wall. Designs already ordered in it are untouched:
   * every line froze its own copy of the brand, code, name and hex at checkout,
   * so a job on the floor still names the thread it needs.
   */
  @Delete('threads/:id')
  async deleteThread(@Param('id') id: string) {
    const remaining = await this.prisma.threadColor.count({ where: { isActive: true, id: { not: id } } });
    // The editor cannot offer a design with no colour, so the last active spool
    // is not removable — the shop would silently stop selling personalisation.
    if (!remaining) throw new BadRequestException('At least one thread colour has to stay available.');

    await this.prisma.threadColor.delete({ where: { id } });
    return { ok: true };
  }

  /** Normalises and validates what the admin typed. */
  private threadData(body: ThreadBody, requireAll: boolean) {
    const out: { brand?: string; code?: string; name?: string; hex?: string; isActive?: boolean; sortOrder?: number } = {};

    for (const field of ['brand', 'code', 'name'] as const) {
      const value = body[field];
      if (value !== undefined) {
        const trimmed = String(value).trim();
        if (!trimmed) throw new BadRequestException(`A thread needs a ${field}.`);
        out[field] = trimmed;
      } else if (requireAll) {
        throw new BadRequestException(`A thread needs a ${field}.`);
      }
    }

    if (body.hex !== undefined) {
      // Stored lower-case with the hash, so two spellings of the same colour
      // cannot end up looking like two different swatches in the editor.
      const hex = String(body.hex).trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) throw new BadRequestException('Colour must be a 6-digit hex value, like #1a2b3c.');
      out.hex = hex;
    } else if (requireAll) {
      throw new BadRequestException('A thread needs a colour.');
    }

    if (body.isActive !== undefined) out.isActive = body.isActive;
    if (body.sortOrder !== undefined && Number.isFinite(body.sortOrder)) out.sortOrder = body.sortOrder;
    return out;
  }

  // ── Positions ────────────────────────────────────────────────────────
  // Fully admin-managed. A shop that starts offering beanie cuffs adds the
  // position here; nothing about it is compiled in.

  @Get('products/:productId/placements')
  async listPlacements(@Param('productId') productId: string) {
    const placements = await this.prisma.personalizationPlacement.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });

    const urls = await this.assetUrls.resolveBatch(placements.map((p) => p.mediaKey).filter(Boolean) as string[]);

    return placements.map((p) => ({
      id: p.id,
      key: p.key,
      label: p.label,
      hint: p.hint,
      fieldWidthMm: p.fieldWidthMm,
      fieldHeightMm: p.fieldHeightMm,
      maxColors: p.maxColors,
      maxChars: p.maxChars,
      priceCents: p.priceCents,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      mediaKey: p.mediaKey,
      imageUrl: p.mediaKey ? (urls.get(p.mediaKey) ?? null) : null,
      isTraced: p.isTraced,
      corners: [
        { x: p.topLeftXPct, y: p.topLeftYPct },
        { x: p.topRightXPct, y: p.topRightYPct },
        { x: p.bottomRightXPct, y: p.bottomRightYPct },
        { x: p.bottomLeftXPct, y: p.bottomLeftYPct },
      ],
    }));
  }

  @Post('products/:productId/placements')
  async createPlacement(@Param('productId') productId: string, @Body() body: PlacementBody & { key?: string }) {
    const key = body.key?.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!key) throw new BadRequestException('A position needs a key.');

    const label = parseLocalized(body.label);
    if (!label) throw new BadRequestException('A position needs a name in at least one language.');

    // Only a product that can be personalised at all — a position on anything
    // else is data nothing will ever read.
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { personalizationTemplateId: true },
    });
    if (!product?.personalizationTemplateId) {
      throw new BadRequestException('Turn personalisation on for this product first.');
    }

    const count = await this.prisma.personalizationPlacement.count({ where: { productId } });
    const numbers = this.placementNumbers(body);

    return this.prisma.personalizationPlacement.create({
      data: {
        productId,
        key,
        label,
        hint: parseLocalized(body.hint) ?? Prisma.JsonNull,
        mediaKey: body.mediaKey?.trim() || null,
        // The hoop field has no sensible default — it is a measurement of a
        // real frame — so a position created without one gets a conservative
        // cap-front size the admin is expected to correct.
        fieldWidthMm: numbers.fieldWidthMm ?? 100,
        fieldHeightMm: numbers.fieldHeightMm ?? 50,
        maxColors: numbers.maxColors ?? 3,
        maxChars: numbers.maxChars ?? 12,
        priceCents: numbers.priceCents ?? 0,
        previewXPct: numbers.previewXPct ?? 34,
        previewYPct: numbers.previewYPct ?? 42,
        previewWidthPct: numbers.previewWidthPct ?? 32,
        previewHeightPct: numbers.previewHeightPct ?? 15,
        previewRotateDeg: numbers.previewRotateDeg ?? 0,
        sortOrder: count * 10,
      },
    });
  }

  @Patch('placements/:id')
  async updatePlacement(@Param('id') id: string, @Body() body: PlacementBody) {
    const data: Prisma.PersonalizationPlacementUpdateInput = { ...this.placementNumbers(body) };

    if (body.label !== undefined) {
      const label = parseLocalized(body.label);
      // Wiping every language would leave an unnamed button in the storefront,
      // so an empty map is refused rather than stored.
      if (!label) throw new BadRequestException('A position needs a name in at least one language.');
      data.label = label;
    }
    if (body.hint !== undefined) data.hint = parseLocalized(body.hint) ?? Prisma.JsonNull;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    // Swapping the photo keeps the tracing: the shot is usually a re-export of
    // the same framing, and silently discarding the corners would throw away
    // the fiddliest part of setting a position up.
    if (body.mediaKey !== undefined) data.mediaKey = body.mediaKey?.trim() || null;

    if (body.corners !== undefined) {
      if (!Array.isArray(body.corners) || body.corners.length !== 4 || body.corners.some((c) => !Number.isFinite(c?.x) || !Number.isFinite(c?.y))) {
        throw new BadRequestException('A tracing needs exactly four corners.');
      }
      const [tl, tr, br, bl] = body.corners;
      Object.assign(data, {
        topLeftXPct: tl.x, topLeftYPct: tl.y,
        topRightXPct: tr.x, topRightYPct: tr.y,
        bottomRightXPct: br.x, bottomRightYPct: br.y,
        bottomLeftXPct: bl.x, bottomLeftYPct: bl.y,
        isTraced: true,
      });
    }

    return this.prisma.personalizationPlacement.update({ where: { id }, data });
  }

  /**
   * Removing a position takes its photograph and tracing with it, but never the
   * designs already ordered on it — those rows keep their own frozen label,
   * hoop field and artwork, so a job on the floor survives the shop changing
   * its mind.
   */
  @Delete('placements/:id')
  async deletePlacement(@Param('id') id: string) {
    await this.prisma.personalizationPlacement.delete({ where: { id } });
    return { ok: true };
  }

  private placementNumbers(body: PlacementBody): Record<string, number> {
    const out: Record<string, number> = {};
    const numeric = [
      'fieldWidthMm', 'fieldHeightMm', 'maxColors', 'maxChars', 'priceCents',
      'previewXPct', 'previewYPct', 'previewWidthPct', 'previewHeightPct', 'previewRotateDeg',
    ] as const;
    for (const field of numeric) {
      const value = body[field];
      if (typeof value === 'number' && Number.isFinite(value)) out[field] = value;
    }
    return out;
  }

  /**
   * Turns personalisation on or off for one product. The only write the admin
   * needs on day one — placements and bands are shop-wide and seeded, while
   * "can this cap be embroidered" is a per-product decision.
   */
  @Patch('products/:productId/template')
  async setProductTemplate(@Param('productId') productId: string, @Body() body: { templateId: string | null }) {
    if (body.templateId) {
      const exists = await this.prisma.personalizationTemplate.count({ where: { id: body.templateId } });
      if (!exists) throw new BadRequestException('Template not found');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: { personalizationTemplateId: body.templateId },
      select: { id: true, slug: true, personalizationTemplateId: true },
    });
  }
}


/** Everything the admin can set on a position. All optional — PATCH is partial. */
interface PlacementBody {
  label?: unknown;
  hint?: unknown;
  mediaKey?: string | null;
  corners?: { x: number; y: number }[];
  fieldWidthMm?: number;
  fieldHeightMm?: number;
  maxColors?: number;
  maxChars?: number;
  priceCents?: number;
  previewXPct?: number;
  previewYPct?: number;
  previewWidthPct?: number;
  previewHeightPct?: number;
  previewRotateDeg?: number;
  isActive?: boolean;
  sortOrder?: number;
}

/** What the admin can set on a thread. All optional — PATCH is partial. */
interface ThreadBody {
  brand?: string;
  code?: string;
  name?: string;
  hex?: string;
  isActive?: boolean;
  sortOrder?: number;
}
