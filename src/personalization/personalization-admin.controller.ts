import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { OrderStatus, Prisma } from '../../generated/prisma/client';
import { PersonalizationService } from './personalization.service';
import { designElementsOf } from './design-elements';
import { parseLocalized } from './localized.util';
import { TRACED_PANEL_HEIGHT_MM, TRACED_PANEL_WIDTH_MM } from './personalization.constants';
import { parseSvgArtwork, SvgArtworkError } from './svg-artwork';

/**
 * A stable, lower-case key. Stored designs and tabs are referred to by it, so
 * it is generated once and never renamed — the localized name is what changes.
 */
function slugKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Order in which the floor works a job. Anything else is rejected. */
/**
 * Two states, because two is all the floor acts on: a job is either still to
 * do or it is finished.
 *
 * It used to run pending → digitizing → ready → stitched. Those described the
 * digitiser's own passes, not decisions anyone made from this queue — nobody
 * filtered for "ready" and did something different from "digitizing" — so
 * they were four columns of bookkeeping on the way to the only question the
 * queue is asked: what is left.
 */
const PRODUCTION_STATUSES = ['waiting', 'done'] as const;
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
    priceCents: r.priceCents,
    productionStatus: r.productionStatus,
    productionNote: r.productionNote,
    stitchFileKey: r.stitchFileKey,
    digitizedAt: r.digitizedAt,
    hasArtwork: r.productionSvg != null,
    updatedAt: r.updatedAt,
    /** Every box in the hoop — what the operator actually sews, one by one. */
    elements: designElementsOf(r),
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
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.embroideryFont.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.threadColor.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    return { templates, fonts, threads };
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
      include: { optionImages: { select: { optionValueId: true, mediaKey: true } } },
    });

    const urls = await this.assetUrls.resolveBatch(
      placements.flatMap((p) => [p.mediaKey, ...p.optionImages.map((i) => i.mediaKey)]).filter(Boolean) as string[],
    );

    return placements.map((p) => ({
      id: p.id,
      key: p.key,
      label: p.label,
      hint: p.hint,
      fieldWidthMm: p.fieldWidthMm,
      fieldHeightMm: p.fieldHeightMm,
      priceCents: p.priceCents,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      mediaKey: p.mediaKey,
      imageUrl: p.mediaKey ? (urls.get(p.mediaKey) ?? null) : null,
      /** This position photographed per variation option — see PersonalizationPlacementOptionImage. */
      optionImages: p.optionImages.map((i) => ({ optionValueId: i.optionValueId, mediaKey: i.mediaKey, imageUrl: urls.get(i.mediaKey) ?? null })),
    }));
  }

  /**
   * The product's variation options a position photo can be tied to: each
   * attribute linked to the product, in the product's order, with only the
   * values at least one of its variants uses — a colour the product is not
   * sold in has no photo to take.
   */
  @Get('products/:productId/placement-options')
  async placementOptions(@Param('productId') productId: string) {
    const [links, used] = await Promise.all([
      this.prisma.productVariantAttribute.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
        include: { attribute: { include: { optionValues: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } } },
      }),
      this.prisma.variantOption.findMany({
        where: { variant: { productId }, optionValueId: { not: null } },
        select: { optionValueId: true },
        distinct: ['optionValueId'],
      }),
    ]);
    const inUse = new Set(used.map((u) => u.optionValueId));
    return links
      .map((l) => ({
        attributeId: l.attributeId,
        name: l.attribute.name,
        adminLabel: l.attribute.adminLabel ?? null,
        values: l.attribute.optionValues
          .filter((v) => inUse.has(v.id))
          .map((v) => ({ id: v.id, value: v.value, displayValue: v.displayValue, swatchType: v.swatchType, swatchValue: v.swatchValue })),
      }))
      .filter((a) => a.values.length > 0);
  }

  /** Sets this position's photo for one variation option (replacing any earlier one). */
  @Put('placements/:id/option-images/:optionValueId')
  async setPlacementOptionImage(
    @Param('id') id: string,
    @Param('optionValueId') optionValueId: string,
    @Body() body: { mediaKey?: string | null },
  ) {
    const mediaKey = body.mediaKey?.trim();
    if (!mediaKey) throw new BadRequestException('Choose a photo.');
    const placement = await this.prisma.personalizationPlacement.findUnique({ where: { id }, select: { productId: true } });
    if (!placement) throw new NotFoundException('Position not found');
    // Only an option of this product: a photo tied to an option no variant of
    // it has would never be shown.
    const option = await this.prisma.variationOptionValue.findUnique({ where: { id: optionValueId }, select: { attributeId: true } });
    const linked = option
      ? await this.prisma.productVariantAttribute.findUnique({ where: { productId_attributeId: { productId: placement.productId, attributeId: option.attributeId } } })
      : null;
    if (!linked) throw new BadRequestException("That option is not one of this product's variation options.");

    await this.prisma.personalizationPlacementOptionImage.upsert({
      where: { placementId_optionValueId: { placementId: id, optionValueId } },
      create: { placementId: id, optionValueId, mediaKey },
      update: { mediaKey },
    });
    return { ok: true };
  }

  @Delete('placements/:id/option-images/:optionValueId')
  async removePlacementOptionImage(@Param('id') id: string, @Param('optionValueId') optionValueId: string) {
    await this.prisma.personalizationPlacementOptionImage.deleteMany({ where: { placementId: id, optionValueId } });
    return { ok: true };
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
        // Not asked for and not writable: the tracing means "the area about
        // this wide", and the scale is the same constant for every position.
        fieldWidthMm: TRACED_PANEL_WIDTH_MM,
        fieldHeightMm: TRACED_PANEL_HEIGHT_MM,
        priceCents: numbers.priceCents ?? 0,
        previewXPct: numbers.previewXPct ?? 34,
        previewYPct: numbers.previewYPct ?? 42,
        previewWidthPct: numbers.previewWidthPct ?? 32,
        previewHeightPct: numbers.previewHeightPct ?? 15,
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
    // Swapping the photo is all there is to it now: there is no tracing on a
    // position to keep or to discard.
    if (body.mediaKey !== undefined) data.mediaKey = body.mediaKey?.trim() || null;

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

  /**
   * `fieldWidthMm`/`fieldHeightMm` are deliberately NOT here. They are the
   * panel's scale, they are the same constant for every catalogue position, and
   * leaving them writable is what let two positions on one cap drift to 100×50
   * and 50×80 — which drew the same lettering at twice the size on one panel.
   */
  private placementNumbers(body: PlacementBody): Record<string, number> {
    const out: Record<string, number> = {};
    const numeric = [
      'priceCents',
      'previewXPct', 'previewYPct', 'previewWidthPct', 'previewHeightPct',
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
  async setProductTemplate(@Param('productId') productId: string, @Body() body: { templateId?: string | null; enabled?: boolean }) {
    // `enabled` is the product page's switch: on means the shop's standard
    // template, off means none — the admin never has to know a template exists.
    let templateId: string | null | undefined = body.templateId;
    if (body.enabled !== undefined) {
      if (body.enabled) {
        const std = await this.prisma.personalizationTemplate.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
        if (!std) throw new BadRequestException('No embroidery template is set up yet.');
        templateId = std.id;
      } else {
        templateId = null;
      }
    }
    if (templateId === undefined) throw new BadRequestException('Nothing to change.');
    if (templateId) {
      const exists = await this.prisma.personalizationTemplate.count({ where: { id: templateId } });
      if (!exists) throw new BadRequestException('Template not found');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: { personalizationTemplateId: templateId },
      select: { id: true, slug: true, personalizationTemplateId: true },
    });
  }

  // ── The design library ───────────────────────────────────────────────
  // Both the designs and the tabs they sit under are the shop's own data. A
  // headwear shop wants "Sport" where a christening shop wants "Baptism", and
  // neither should need a deploy — so nothing here is compiled in.

  @Get('motif-categories')
  listMotifCategories() {
    return this.prisma.embroideryMotifCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { motifs: true } } },
    });
  }

  @Post('motif-categories')
  async createMotifCategory(@Body() body: MotifCategoryBody) {
    const name = parseLocalized(body.name);
    if (!name) throw new BadRequestException('A tab needs a name in at least one language.');

    const key = slugKey(body.key) || slugKey(String(name.en ?? Object.values(name)[0] ?? ''));
    if (!key) throw new BadRequestException('A tab needs a key.');

    const count = await this.prisma.embroideryMotifCategory.count();
    try {
      return await this.prisma.embroideryMotifCategory.create({
        data: { key, name, sortOrder: body.sortOrder ?? count * 10 },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new BadRequestException(`A tab with the key "${key}" already exists.`);
      throw err;
    }
  }

  @Patch('motif-categories/:id')
  async updateMotifCategory(@Param('id') id: string, @Body() body: MotifCategoryBody) {
    const data: Prisma.EmbroideryMotifCategoryUpdateInput = {};
    if (body.name !== undefined) {
      const name = parseLocalized(body.name);
      // An unnamed tab is a blank button in the storefront, so an empty map is
      // refused rather than stored.
      if (!name) throw new BadRequestException('A tab needs a name in at least one language.');
      data.name = name;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.sortOrder !== undefined && Number.isFinite(body.sortOrder)) data.sortOrder = body.sortOrder;
    // The key is never renamed: it is what the editor filters on, and a rename
    // would silently empty the tab. The name above is what changes.
    return this.prisma.embroideryMotifCategory.update({ where: { id }, data });
  }

  /**
   * Removes a tab. Its designs are kept — the foreign key is ON DELETE SET
   * NULL, so they fall back to showing only under "All" and the shop can
   * re-file them. Deleting a tab must never delete artwork.
   */
  @Delete('motif-categories/:id')
  async deleteMotifCategory(@Param('id') id: string) {
    const orphaned = await this.prisma.embroideryMotif.count({ where: { categoryId: id } });
    await this.prisma.embroideryMotifCategory.delete({ where: { id } });
    return { ok: true, orphaned };
  }

  @Get('motifs')
  async listMotifs() {
    const motifs = await this.prisma.embroideryMotif.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { category: { select: { id: true, key: true } } },
    });
    return motifs.map((m) => ({
      id: m.id,
      key: m.key,
      name: m.name,
      path: m.path,
      viewBox: m.viewBox,
      paths: m.paths,
      ownColours: m.ownColours,
      priceCents: m.priceCents,
      colorCount: m.colorCount,
      categoryId: m.categoryId,
      categoryKey: m.category?.key ?? null,
      isActive: m.isActive,
      sortOrder: m.sortOrder,
    }));
  }

  /**
   * Reads an uploaded SVG without storing anything.
   *
   * The admin sees what will actually be stored — the parsed shapes, drawn the
   * way the storefront draws them — rather than the file as their browser
   * renders it. The two differ whenever something in the file cannot be
   * stitched, and that is exactly when they need to know.
   */
  @Post('motifs/parse')
  parseMotifSvg(@Body() body: { svg?: unknown }) {
    return this.readSvg(body.svg);
  }

  @Post('motifs')
  async createMotif(@Body() body: MotifBody) {
    const name = parseLocalized(body.name);
    if (!name) throw new BadRequestException('A design needs a name in at least one language.');

    const key = slugKey(body.key) || slugKey(String(name.en ?? Object.values(name)[0] ?? ''));
    if (!key) throw new BadRequestException('A design needs a key.');

    const art = this.readSvg(body.svg);
    const categoryId = await this.categoryIdFor(body);
    const count = await this.prisma.embroideryMotif.count();
    // An uploaded design is stitched as its file draws it: the customer resizes
    // and places it, and does not recolour it. So this follows the artwork and is
    // not a setting — anything with shapes keeps their fills. (The only designs
    // sewn in a thread the customer picks are the older seeded silhouettes,
    // which have no fills to keep.)
    const ownColours = art.shapes.length > 0;

    try {
      return await this.prisma.embroideryMotif.create({
        data: {
          key,
          name,
          path: art.path,
          viewBox: art.viewBox,
          paths: art.shapes as unknown as Prisma.InputJsonValue,
          ownColours,
          colorCount: this.positiveInt(body.colorCount) ?? (ownColours ? art.colorCount : 1),
          priceCents: this.nonNegativeInt(body.priceCents) ?? 0,
          ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
          sortOrder: body.sortOrder ?? count * 10,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new BadRequestException(`A design with the key "${key}" already exists.`);
      throw err;
    }
  }

  @Patch('motifs/:id')
  async updateMotif(@Param('id') id: string, @Body() body: MotifBody) {
    const data: Prisma.EmbroideryMotifUpdateInput = {};

    if (body.name !== undefined) {
      const name = parseLocalized(body.name);
      if (!name) throw new BadRequestException('A design needs a name in at least one language.');
      data.name = name;
    }
    // Re-uploading replaces the artwork; leaving `svg` out keeps it, so the
    // shop can rename or re-file a design without having the file to hand.
    if (body.svg !== undefined) {
      const art = this.readSvg(body.svg);
      // Replacement artwork brings its own colours with it — see `create`.
      const ownColours = art.shapes.length > 0;
      data.path = art.path;
      data.viewBox = art.viewBox;
      data.paths = art.shapes as unknown as Prisma.InputJsonValue;
      data.ownColours = ownColours;
      data.colorCount = ownColours ? art.colorCount : 1;
    }

    if (body.priceCents !== undefined) {
      const value = this.nonNegativeInt(body.priceCents);
      if (value === null) throw new BadRequestException('The extra charge has to be zero or more.');
      data.priceCents = value;
    }
    if (body.colorCount !== undefined) {
      const value = this.positiveInt(body.colorCount);
      if (!value) throw new BadRequestException('The colour count has to be a number above zero.');
      data.colorCount = value;
    }
    if (body.categoryId !== undefined || body.categoryKey !== undefined) {
      const categoryId = await this.categoryIdFor(body);
      data.category = categoryId ? { connect: { id: categoryId } } : { disconnect: true };
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.sortOrder !== undefined && Number.isFinite(body.sortOrder)) data.sortOrder = body.sortOrder;

    return this.prisma.embroideryMotif.update({ where: { id }, data });
  }

  /**
   * Removes a design from the library. Designs already ordered are untouched:
   * every line froze the shape's own path, viewBox and colours into its
   * document at checkout, so a job on the floor still draws what was bought.
   */
  @Delete('motifs/:id')
  async deleteMotif(@Param('id') id: string) {
    await this.prisma.embroideryMotif.delete({ where: { id } });
    return { ok: true };
  }

  /** Parses an uploaded SVG, turning a parse failure into the admin's own words. */
  private readSvg(svg: unknown) {
    if (typeof svg !== 'string' || !svg.trim()) throw new BadRequestException('Upload the design as an SVG file.');
    if (svg.length > 2_000_000) throw new BadRequestException('That file is too large. A stitched design is line art, not a photo.');
    try {
      return parseSvgArtwork(svg);
    } catch (err) {
      if (err instanceof SvgArtworkError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /** The tab a design goes under, by id or by key. Null clears it. */
  private async categoryIdFor(body: MotifBody): Promise<string | null> {
    if (body.categoryId) {
      const found = await this.prisma.embroideryMotifCategory.count({ where: { id: body.categoryId } });
      if (!found) throw new BadRequestException('That tab does not exist.');
      return body.categoryId;
    }
    if (body.categoryKey) {
      const found = await this.prisma.embroideryMotifCategory.findUnique({ where: { key: body.categoryKey }, select: { id: true } });
      if (!found) throw new BadRequestException('That tab does not exist.');
      return found.id;
    }
    return null;
  }

  private positiveInt(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  /** Money: zero is a real answer, so it is not folded in with "missing". */
  private nonNegativeInt(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
}


/** Everything the admin can set on a position. All optional — PATCH is partial. */
interface PlacementBody {
  label?: unknown;
  hint?: unknown;
  mediaKey?: string | null;
  priceCents?: number;
  previewXPct?: number;
  previewYPct?: number;
  previewWidthPct?: number;
  previewHeightPct?: number;
  isActive?: boolean;
  sortOrder?: number;
}

/** What the admin can set on a design library tab. All optional — PATCH is partial. */
interface MotifCategoryBody {
  key?: string;
  name?: unknown;
  isActive?: boolean;
  sortOrder?: number;
}

/** What the admin can set on a design. All optional — PATCH is partial. */
interface MotifBody {
  key?: string;
  name?: unknown;
  /** The uploaded artwork. Parsed into shapes; the file itself is never stored. */
  svg?: unknown;
  /** What picking this design adds to the embroidery price, in cents. */
  priceCents?: number;
  colorCount?: number;
  categoryId?: string | null;
  categoryKey?: string | null;
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
