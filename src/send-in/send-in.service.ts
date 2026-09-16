import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp');
import { PrismaService } from '../prisma/prisma.service';
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { CommerceEventBus } from '../commerce-events/commerce-event-bus.service';
import { COMMERCE_EVENTS, SendInStatusChangedEvent } from '../commerce-events/commerce-events.constants';
import { Prisma } from '../../generated/prisma/client';
import { parseLocalized, pickLocalized } from '../personalization/localized.util';
import { PersonalizationService } from '../personalization/personalization.service';
import { designElementsOf } from '../personalization/design-elements';
import {
  SEND_IN_ENABLED_KEY,
  SEND_IN_ARTWORK_MAX_BYTES,
  SEND_IN_ARTWORK_MAX_PX,
  SEND_IN_ARTWORK_MIMES,
  SEND_IN_ARTWORK_PREFIX,
  SEND_IN_PHOTO_MAX,
  SEND_IN_PHOTO_MAX_BYTES,
  SEND_IN_PHOTO_MIMES,
  SEND_IN_PHOTO_PREFIX,
  SEND_IN_PHOTO_REQUIRED,
  SEND_IN_MAX_SIDES,
  SEND_IN_PLACEMENT_KEYS,
  SEND_IN_PRODUCT_SLUG,
  SEND_IN_STATUSES,
  SEND_IN_TRANSITIONS,
  SendInStatus,
} from './send-in.constants';

/** Either the root PrismaService or a transaction client handed down by a caller. */
type Db = PrismaService | Prisma.TransactionClient;

/** One side of the item, as the job records it. */
export interface JobSide {
  placementKey: string;
  photoKey: string;
  mockupKey: string | null;
}

/** What a design document carries about the customer's item — see PersonalizationService.resolve. */
interface StoredCustomerItem {
  itemType: string;
  photoKeys: string[];
  corners: { x: number; y: number }[];
  panelWidthMm: number;
  panelHeightMm: number;
  note: string | null;
}

export interface SendInUpdate {
  status?: string;
  note?: string | null;
  /** Media-library keys — what the customer will be shown for this step. */
  photoKeys?: string[];
  returnCarrier?: string | null;
  returnTrackingNumber?: string | null;
  returnTrackingUrl?: string | null;
}

const JOB_INCLUDE = {
  events: { orderBy: { createdAt: 'asc' as const } },
  order: { select: { id: true, orderNumber: true, status: true, customerName: true, customerEmail: true, createdAt: true } },
  orderItem: {
    select: { id: true, titleSnapshot: true, personalizations: { select: { id: true, placementKey: true, text: true, productionStatus: true, stitchEstimate: true, priceCents: true, designJson: true, contentType: true, lineCount: true, fontName: true, fontWeight: true, heightMm: true, curveDeg: true, isPuff: true, motifName: true, motifSizeMm: true, threadColors: true, rotationDeg: true } } },
  },
} satisfies Prisma.SendInJobInclude;

/** How long to wait for the order's transaction to commit before drawing the mockup, and how often to retry. */
const MOCKUP_DELAY_MS = 1500;
const MOCKUP_ATTEMPTS = 3;

type JobRow = Prisma.SendInJobGetPayload<{ include: typeof JOB_INCLUDE }>;

/**
 * Embroidery on the customer's own item.
 *
 * The design is an ordinary personalised order line — priced, sheeted and
 * queued like any other. What this owns is everything around it: the hidden
 * product the line is sold under, the customer's photographs, and the job
 * that follows the item from their letterbox to the bench and back.
 */
@Injectable()
export class SendInService {
  private readonly logger = new Logger(SendInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly assetUrls: AssetUrlService,
    private readonly eventBus: CommerceEventBus,
    private readonly personalization: PersonalizationService,
  ) {}

  // ── What the storefront needs to start ───────────────────────────────

  /**
   * The service as offered: the hidden product, one variant per item type
   * with its handling price, and where to post the item. Null until the
   * product has been seeded and switched on.
   */
  /** Whether the service is offered to customers — the admin's one switch over the whole thing. */
  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.platformSettings.findUnique({ where: { key: SEND_IN_ENABLED_KEY } });
    return row ? row.value === 'true' : true;
  }

  async setEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    await this.prisma.platformSettings.upsert({
      where: { key: SEND_IN_ENABLED_KEY },
      create: { key: SEND_IN_ENABLED_KEY, value: String(enabled) },
      update: { value: String(enabled) },
    });
    return { enabled };
  }

  async config(lang?: string) {
    if (!(await this.isEnabled())) return null;
    const product = await this.prisma.product.findFirst({
      where: { slug: SEND_IN_PRODUCT_SLUG, isService: true, status: 'active', deletedAt: null },
      select: { id: true, slug: true, title: true, basePriceCents: true, personalizationTemplate: { select: { isActive: true } } },
    });
    if (!product?.personalizationTemplate?.isActive) return null;

    const types = await this.prisma.sendInItemType.findMany({
      where: { isActive: true, variant: { productId: product.id } },
      include: { variant: { select: { id: true, priceCents: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!types.length) return null;
    const imageUrls = await this.assetUrls.resolveBatch(types.map((t) => t.imageKey).filter(Boolean) as string[]);

    return {
      productId: product.id,
      productSlug: product.slug,
      productTitle: product.title,
      /** One per side the customer may photograph, in order. */
      placementKeys: [...SEND_IN_PLACEMENT_KEYS],
      maxSides: SEND_IN_MAX_SIDES,
      itemTypes: types.map((t) => ({
        key: t.key,
        label: pickLocalized(t.label, lang),
        hint: pickLocalized(t.hint, lang) || null,
        imageUrl: t.imageKey ? (imageUrls.get(t.imageKey) ?? null) : null,
        variantId: t.variant.id,
        /** Handling and return postage — charged once per side. */
        priceCents: t.priceCents,
        allowPuff: t.allowPuff,
        maxChars: t.maxChars,
      })),
      returnAddress: this.returnAddress(),
    };
  }

  /** Where the customer posts the item — the shop's own address, from the same settings the receipts use. */
  returnAddress() {
    return {
      name: process.env.SELLER_NAME ?? 'Silomis',
      line1: process.env.SELLER_ADDRESS_LINE1 ?? '',
      zip: process.env.SELLER_ADDRESS_ZIP ?? '',
      city: process.env.SELLER_ADDRESS_CITY ?? '',
      country: process.env.SELLER_ADDRESS_COUNTRY ?? 'FR',
    };
  }

  // ── The customer's photographs ───────────────────────────────────────

  /**
   * Stores the customer's photos privately and hands back keys the design
   * may refer to, plus signed URLs for the editor to show them. The keys are
   * validated again when the design is resolved, so a key that was not
   * minted here is never accepted.
   */
  async uploadPhotos(files: Express.Multer.File[]): Promise<{ photos: { key: string; url: string }[] }> {
    if (!files.length) throw new BadRequestException('Add a photo of your item.');
    if (files.length > SEND_IN_PHOTO_MAX) throw new BadRequestException(`At most ${SEND_IN_PHOTO_MAX} photos.`);
    for (const f of files) {
      if (!SEND_IN_PHOTO_MIMES.has(f.mimetype)) throw new BadRequestException(`Unsupported file type: ${f.mimetype}`);
      if (f.size > SEND_IN_PHOTO_MAX_BYTES) throw new BadRequestException('A photo may be at most 10MB.');
    }
    const photos: { key: string; url: string }[] = [];
    for (const f of files) {
      const ext = f.mimetype === 'image/png' ? 'png' : f.mimetype === 'image/webp' ? 'webp' : f.mimetype.startsWith('image/hei') ? 'heic' : 'jpg';
      const key = `${SEND_IN_PHOTO_PREFIX}${randomUUID()}.${ext}`;
      await this.gcs.upload(f.buffer, key, f.mimetype, 'private');
      photos.push({ key, url: await this.assetUrls.resolve(key) });
    }
    return { photos };
  }

  /**
   * The customer's own logo or drawing, to embroider on their item.
   *
   * Two files are kept: the original as uploaded, which is what the
   * digitiser wants (an SVG stays an SVG), and a bounded PNG rendering that
   * the editor, the mockup and the desk's picture all draw from. The
   * rendering is trimmed to its drawn extent, so the size the customer sets
   * is the size of the logo — not of the white margin around it — and its
   * drawn share is measured for the stitch estimate.
   */
  async uploadArtwork(file: Express.Multer.File | undefined): Promise<{ key: string; url: string; name: string; widthPx: number; heightPx: number; coverage: number }> {
    if (!file) throw new BadRequestException('Choose a logo or drawing to upload.');
    if (!SEND_IN_ARTWORK_MIMES.has(file.mimetype)) throw new BadRequestException('Use a PNG, JPG, WebP or SVG file.');
    if (file.size > SEND_IN_ARTWORK_MAX_BYTES) throw new BadRequestException('A logo may be at most 10MB.');

    const id = randomUUID();
    const ext = file.mimetype === 'image/svg+xml' ? 'svg' : file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    // A vector is rasterised at a density that gives it real pixels to work
    // with; a bitmap is taken as it is, then both are bounded.
    let image = sharp(file.buffer, file.mimetype === 'image/svg+xml' ? { density: 300 } : undefined).rotate().ensureAlpha();
    try {
      // Off the margins: a JPG logo on white, or a PNG with air around it,
      // should be sized by its drawing. Uniform images make trim throw; they
      // are kept whole.
      image = sharp(await image.trim({ threshold: 12 }).toBuffer()).ensureAlpha();
    } catch {
      image = sharp(file.buffer, file.mimetype === 'image/svg+xml' ? { density: 300 } : undefined).rotate().ensureAlpha();
    }
    let png: Buffer;
    try {
      png = await image.resize({ width: SEND_IN_ARTWORK_MAX_PX, height: SEND_IN_ARTWORK_MAX_PX, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    } catch {
      throw new BadRequestException('That file could not be read as an image.');
    }
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) throw new BadRequestException('That file could not be read as an image.');
    // A pixel counts as drawn when it is opaque and not (near-)white — white
    // on a white cap is nothing to stitch.
    let drawn = 0;
    const total = info.width * info.height;
    for (let i = 0; i < data.length; i += info.channels) {
      const a = info.channels === 4 ? data[i + 3] : 255;
      if (a < 128) continue;
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue;
      drawn += 1;
    }
    const coverage = Math.min(1, Math.max(0.05, drawn / Math.max(1, total)));

    const key = `${SEND_IN_ARTWORK_PREFIX}${id}.png`;
    const originalKey = `${SEND_IN_ARTWORK_PREFIX}${id}-original.${ext}`;
    await Promise.all([this.gcs.upload(png, key, 'image/png', 'private'), this.gcs.upload(file.buffer, originalKey, file.mimetype, 'private')]);
    const name = (file.originalname || `logo.${ext}`).replace(/[\r\n\t]/g, ' ').slice(0, 200);
    await this.prisma.sendInArtwork.create({
      data: { key, originalKey, originalName: name, mime: file.mimetype, widthPx: info.width, heightPx: info.height, coverage },
    });
    return { key, url: await this.assetUrls.resolve(key), name, widthPx: info.width, heightPx: info.height, coverage };
  }

  // ── From order to job ────────────────────────────────────────────────

  /**
   * Opens a job for every order line whose design was made on the
   * customer's own item. Called inside the order's own transaction, so an
   * order can never exist with a send-in line and no job to follow it.
   */
  async createJobsForOrder(db: Db, orderId: string): Promise<void> {
    const items = await db.orderItem.findMany({
      where: { orderId },
      include: { personalizations: { select: { placementKey: true, designJson: true }, orderBy: { placementKey: 'asc' } } },
    });
    for (const item of items) {
      // Every side of one item is one job: one parcel, one round trip.
      const sides: JobSide[] = [];
      let itemType = '';
      let note: string | null = null;
      let panel: { corners: unknown; widthMm: number; heightMm: number } | null = null;
      for (const design of item.personalizations) {
        const doc = design.designJson as { customerItem?: StoredCustomerItem | null } | null;
        const ci = doc?.customerItem;
        if (!ci) continue;
        itemType ||= ci.itemType;
        note ||= ci.note;
        panel ??= { corners: ci.corners, widthMm: ci.panelWidthMm, heightMm: ci.panelHeightMm };
        sides.push({ placementKey: design.placementKey, photoKey: ci.photoKeys[0], mockupKey: null });
      }
      if (!sides.length || !panel) continue;
      const job = await db.sendInJob.create({
        data: {
          orderId,
          orderItemId: item.id,
          itemType,
          note,
          photoKeys: sides.map((sd) => sd.photoKey),
          sides: sides as unknown as Prisma.InputJsonValue,
          panelCorners: panel.corners as Prisma.InputJsonValue,
          panelWidthMm: panel.widthMm,
          panelHeightMm: panel.heightMm,
          status: 'awaiting_item',
          events: { create: { status: 'awaiting_item' } },
        },
      });
      // Drawn after the order's own transaction has committed, off the
      // request path: a picture that arrives a second later costs nothing,
      // a render failure that lost the sale would cost everything.
      this.scheduleMockup(job.id);
    }
  }

  private scheduleMockup(jobId: string, attempt = 1): void {
    const timer = setTimeout(() => {
      this.renderMockup(jobId).catch((err: Error) => {
        if (attempt < MOCKUP_ATTEMPTS) return this.scheduleMockup(jobId, attempt + 1);
        this.logger.warn(`Send-in mockup failed for job ${jobId}: ${err.message}`);
      });
    }, MOCKUP_DELAY_MS * attempt);
    // Never the reason a process stays up: a shutdown mid-wait loses one
    // picture, which the desk can redraw.
    timer.unref?.();
  }

  /**
   * The customer's photograph with their design drawn on it, as they saw it
   * in the editor. Composited from the stored photo and the frozen design,
   * so it can be redrawn at any time — and it is the one picture the desk
   * holds next to the parcel.
   */
  async renderMockup(jobId: string): Promise<void> {
    const job = await this.prisma.sendInJob.findUnique({
      where: { id: jobId },
      include: { orderItem: { include: { personalizations: true } } },
    });
    if (!job) throw new Error('job not found yet');
    const sides = (job.sides as unknown as JobSide[]) ?? [];
    const corners = job.panelCorners as { x: number; y: number }[];

    const rendered: JobSide[] = [];
    for (const side of sides) {
      const design = job.orderItem.personalizations.find((d) => d.placementKey === side.placementKey);
      if (!design || !side.photoKey) {
        rendered.push(side);
        continue;
      }
      const photo = await this.gcs.download(side.photoKey);
      // Bounded so a 12-megapixel phone photo does not become a 12-megapixel
      // mockup: 1600px on the long side is plenty for a screen and a printout.
      //
      // Flattened to a buffer first, because `metadata()` reports the file as
      // stored — before the resize, and before the EXIF rotation a phone
      // photo almost always carries. The overlay must be drawn at the size
      // the pixels actually are, or sharp refuses to composite it.
      const baseBuf = await sharp(photo).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).toBuffer();
      const base = sharp(baseBuf);
      const { width, height } = await base.metadata();
      if (!width || !height) {
        rendered.push(side);
        continue;
      }
      const resolved = this.personalization.resolvedFromRow(design);
      // The customer's own logos, fetched so the overlay can draw the files
      // themselves rather than a labelled frame.
      const images = new Map<string, string>();
      for (const el of resolved.elements) {
        if (el.artwork && !images.has(el.artwork.key)) {
          images.set(el.artwork.key, (await this.gcs.download(el.artwork.key)).toString('base64'));
        }
      }
      const overlay = this.personalization.mockupOverlaySvg(resolved, { widthPx: width, heightPx: height, panel: corners, panelWidthMm: job.panelWidthMm }, images);
      const png = await base.composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png({ compressionLevel: 8 }).toBuffer();
      const key = `${SEND_IN_PHOTO_PREFIX}mockup-${jobId}-${side.placementKey}.png`;
      await this.gcs.upload(png, key, 'image/png', 'private');
      rendered.push({ ...side, mockupKey: key });
    }
    await this.prisma.sendInJob.update({
      where: { id: jobId },
      data: { sides: rendered as unknown as Prisma.InputJsonValue, mockupKey: rendered.find((sd) => sd.mockupKey)?.mockupKey ?? null },
    });
  }

  /**
   * Every job still missing a mockup on some side, drawn now. The render at
   * order time is a timer in one process — a restart, a deploy or a hiccup
   * at the storage loses it — so the sweep is what guarantees the desk a
   * picture, whatever happened the moment the order was placed.
   *
   * Only recent, live jobs: an old cancelled one is not worth a download.
   */
  async renderMissingMockups(limit = 20): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const rows = await this.prisma.sendInJob.findMany({
      where: { createdAt: { gte: since }, status: { notIn: ['cancelled'] } },
      select: { id: true, sides: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const missing = rows.filter((r) => ((r.sides as unknown as JobSide[]) ?? []).some((sd) => sd.photoKey && !sd.mockupKey)).slice(0, limit);
    let done = 0;
    for (const r of missing) {
      try {
        await this.renderMockup(r.id);
        done += 1;
      } catch (err) {
        this.logger.warn(`Send-in mockup still failing for job ${r.id}: ${(err as Error).message}`);
      }
    }
    return done;
  }

  // ── What the customer sees ───────────────────────────────────────────

  /** The job on one order, with every photograph resolved to a URL. */
  async forCustomer(orderId: string, lang?: string) {
    const job = await this.prisma.sendInJob.findUnique({ where: { orderId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    if (!job) return null;
    const type = await this.prisma.sendInItemType.findUnique({ where: { key: job.itemType }, select: { label: true } });
    const sides = (job.sides as unknown as JobSide[]) ?? [];
    const keys = [...job.photoKeys, ...sides.flatMap((sd) => [sd.photoKey, sd.mockupKey ?? '']), ...job.events.flatMap((e) => e.photoKeys)].filter(Boolean);
    const urls = await this.assetUrls.resolveBatch(keys);
    return {
      id: job.id,
      status: job.status,
      itemType: job.itemType,
      /** Every side they photographed: what they called it, their photo, the design drawn on it. */
      sides: sides.map((sd) => ({
        placementKey: sd.placementKey,
        photoUrl: urls.get(sd.photoKey) ?? '',
        mockupUrl: sd.mockupKey ? (urls.get(sd.mockupKey) ?? null) : null,
      })),
      /** In the customer's language — what the send-in note prints. */
      itemLabel: type ? pickLocalized(type.label, lang) : job.itemType,
      note: job.note,
      panelWidthMm: job.panelWidthMm,
      panelHeightMm: job.panelHeightMm,
      photos: job.photoKeys.map((k) => ({ key: k, url: urls.get(k) ?? '' })),
      /** Their photo with the design on it, as they saw it. */
      mockupUrl: job.mockupKey ? (urls.get(job.mockupKey) ?? null) : null,
      returnCarrier: job.returnCarrier,
      returnTrackingNumber: job.returnTrackingNumber,
      returnTrackingUrl: job.returnTrackingUrl,
      events: job.events.map((e) => ({
        id: e.id,
        status: e.status,
        note: e.note,
        photos: e.photoKeys.map((k) => ({ key: k, url: urls.get(k) ?? '' })),
        at: e.createdAt,
      })),
      returnAddress: this.returnAddress(),
    };
  }

  // ── The admin's side ─────────────────────────────────────────────────

  async list(filter: { status?: string; search?: string; limit?: number; offset?: number }) {
    const where: Prisma.SendInJobWhereInput = {
      ...(filter.status && filter.status !== 'all' ? { status: filter.status } : {}),
      // Like the embroidery queue: only a paid order is a parcel to expect.
      order: { status: { in: ['paid', 'processing', 'shipped', 'delivered'] } },
      ...(filter.search
        ? {
            OR: [
              { order: { orderNumber: { contains: filter.search, mode: 'insensitive' } } },
              { order: { customerName: { contains: filter.search, mode: 'insensitive' } } },
              { order: { customerEmail: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.sendInJob.findMany({ where, include: JOB_INCLUDE, orderBy: { createdAt: 'asc' }, take: Math.min(filter.limit ?? 50, 200), skip: filter.offset ?? 0 }),
      this.prisma.sendInJob.count({ where }),
      this.prisma.sendInJob.groupBy({ by: ['status'], where: { order: where.order }, _count: { _all: true } }),
    ]);
    return {
      total,
      counts: Object.fromEntries(SEND_IN_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count._all ?? 0])),
      items: await Promise.all(rows.map((r) => this.toAdmin(r))),
    };
  }

  async forOrder(orderId: string) {
    const row = await this.prisma.sendInJob.findUnique({ where: { orderId }, include: JOB_INCLUDE });
    return row ? this.toAdmin(row) : null;
  }

  async forJob(id: string) {
    const row = await this.prisma.sendInJob.findUnique({ where: { id }, include: JOB_INCLUDE });
    if (!row) throw new NotFoundException('Send-in job not found');
    return this.toAdmin(row);
  }

  /**
   * Moves the job along, records what the shop said and showed, and tells
   * the customer. Every change is an event, so the tracking page is the
   * history rather than a snapshot.
   */
  async update(id: string, dto: SendInUpdate) {
    const job = await this.prisma.sendInJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Send-in job not found');

    const photoKeys = (dto.photoKeys ?? []).filter((k) => typeof k === 'string' && k.startsWith('media/'));
    const note = dto.note?.trim() || null;
    const toStatus = dto.status as SendInStatus | undefined;
    const changingStatus = toStatus !== undefined && toStatus !== job.status;

    if (changingStatus) {
      if (!SEND_IN_STATUSES.includes(toStatus)) throw new BadRequestException(`Status must be one of: ${SEND_IN_STATUSES.join(', ')}`);
      const allowed = SEND_IN_TRANSITIONS[job.status as SendInStatus] ?? [];
      if (!allowed.includes(toStatus)) throw new BadRequestException(`Cannot go from "${job.status}" to "${toStatus}".`);
      // The item as it arrived and the finished piece are the two photographs
      // a send-in customer is actually waiting for — and the shop's own
      // record if a condition is ever disputed.
      if (SEND_IN_PHOTO_REQUIRED.includes(toStatus) && !photoKeys.length) {
        throw new BadRequestException(`Add a photo of the item before marking it "${toStatus.replace(/_/g, ' ')}".`);
      }
      if (toStatus === 'returned' && !(dto.returnTrackingNumber ?? job.returnTrackingNumber)) {
        throw new BadRequestException('Enter the return tracking number before marking the item returned.');
      }
    }

    const data: Prisma.SendInJobUpdateInput = {};
    if (changingStatus) data.status = toStatus;
    if (dto.returnCarrier !== undefined) data.returnCarrier = dto.returnCarrier?.trim() || null;
    if (dto.returnTrackingNumber !== undefined) data.returnTrackingNumber = dto.returnTrackingNumber?.trim() || null;
    if (dto.returnTrackingUrl !== undefined) data.returnTrackingUrl = dto.returnTrackingUrl?.trim() || null;

    // A note or photos without a status change are still worth a line on the
    // timeline — "still waiting on the parcel, tracking says Thursday".
    const worthAnEvent = changingStatus || note || photoKeys.length;
    const updated = await this.prisma.sendInJob.update({
      where: { id },
      data: {
        ...data,
        ...(worthAnEvent ? { events: { create: { status: toStatus ?? job.status, note, photoKeys } } } : {}),
      },
      include: JOB_INCLUDE,
    });

    if (worthAnEvent) {
      const event = updated.events[updated.events.length - 1];
      this.eventBus.emit(
        COMMERCE_EVENTS.SEND_IN_STATUS_CHANGED,
        { jobId: id, orderId: job.orderId, fromStatus: job.status, toStatus: updated.status, eventId: event.id } satisfies SendInStatusChangedEvent,
        { entityId: job.orderId, source: 'send-in' },
      );
    }
    return this.toAdmin(updated);
  }

  private async toAdmin(r: JobRow) {
    const sides = (r.sides as unknown as JobSide[]) ?? [];
    // Every logo the customer uploaded, by position: the rendering for the
    // card, the original for the digitiser.
    const artworks = new Map<string, { name: string; key: string; originalKey: string; widthMm: number; heightMm: number }[]>();
    for (const d of r.orderItem.personalizations) {
      const list = designElementsOf(d).flatMap((el) => (el.artwork ? [el.artwork] : []));
      if (list.length) artworks.set(d.placementKey, list);
    }
    const artworkKeys = [...artworks.values()].flat().flatMap((a) => [a.key, a.originalKey]);
    const keys = [...r.photoKeys, ...sides.flatMap((sd) => [sd.photoKey, sd.mockupKey ?? '']), ...r.events.flatMap((e) => e.photoKeys), ...artworkKeys].filter(Boolean);
    const [urls, type] = await Promise.all([
      this.assetUrls.resolveBatch(keys),
      this.prisma.sendInItemType.findUnique({ where: { key: r.itemType }, select: { label: true } }),
    ]);
    return {
      id: r.id,
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
      orderStatus: r.order.status,
      orderedAt: r.order.createdAt,
      customerName: r.order.customerName,
      customerEmail: r.order.customerEmail,
      itemType: r.itemType,
      itemLabel: type ? pickLocalized(type.label, 'en') : r.itemType,
      note: r.note,
      panelWidthMm: r.panelWidthMm,
      panelHeightMm: r.panelHeightMm,
      photos: r.photoKeys.map((k) => ({ key: k, url: urls.get(k) ?? '' })),
      mockupUrl: r.mockupKey ? (urls.get(r.mockupKey) ?? null) : null,
      sides: sides.map((sd) => ({
        placementKey: sd.placementKey,
        photoUrl: urls.get(sd.photoKey) ?? '',
        mockupUrl: sd.mockupKey ? (urls.get(sd.mockupKey) ?? null) : null,
        design: (() => {
          const d = r.orderItem.personalizations.find((x) => x.placementKey === sd.placementKey);
          return d ? { id: d.id, text: d.text, productionStatus: d.productionStatus, stitchEstimate: d.stitchEstimate } : null;
        })(),
        artworks: (artworks.get(sd.placementKey) ?? []).map((a) => ({
          name: a.name,
          widthMm: a.widthMm,
          heightMm: a.heightMm,
          url: urls.get(a.key) ?? null,
          originalUrl: urls.get(a.originalKey) ?? null,
        })),
      })),
      status: r.status,
      allowedNext: SEND_IN_TRANSITIONS[r.status as SendInStatus] ?? [],
      returnCarrier: r.returnCarrier,
      returnTrackingNumber: r.returnTrackingNumber,
      returnTrackingUrl: r.returnTrackingUrl,
      designs: r.orderItem.personalizations.map((d) => ({ id: d.id, text: d.text, productionStatus: d.productionStatus, stitchEstimate: d.stitchEstimate })),
      events: r.events.map((e) => ({
        id: e.id,
        status: e.status,
        note: e.note,
        photos: e.photoKeys.map((k) => ({ key: k, url: urls.get(k) ?? '' })),
        at: e.createdAt,
      })),
      updatedAt: r.updatedAt,
    };
  }

  // ── The shop's list of item types ────────────────────────────────────

  async listItemTypes() {
    const rows = await this.prisma.sendInItemType.findMany({
      include: { variant: { select: { id: true, sku: true, priceCents: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const urls = await this.assetUrls.resolveBatch(rows.map((r) => r.imageKey).filter(Boolean) as string[]);
    return rows.map((r) => this.toAdminItemType(r, urls));
  }

  /**
   * A new kind of item: a variant of the service product for the price, and
   * the row for everything else. The key is derived from the English name and
   * never changes afterwards — jobs record it.
   */
  async createItemType(dto: ItemTypeInput) {
    const product = await this.prisma.product.findFirst({ where: { slug: SEND_IN_PRODUCT_SLUG, isService: true, deletedAt: null }, select: { id: true } });
    if (!product) throw new BadRequestException('The send-in service product is missing — restart the API to seed it.');
    const label = parseLocalized(dto.label);
    if (!label || !Object.values(label).some(Boolean)) throw new BadRequestException('Give the item type a name.');
    const base = (label.en ?? Object.values(label)[0] ?? 'item')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item';
    let key = base;
    for (let i = 2; await this.prisma.sendInItemType.findUnique({ where: { key } }); i++) key = `${base}-${i}`;
    const fields = this.itemTypeFields(dto);
    const last = await this.prisma.sendInItemType.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });

    const variant = await this.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SENDIN-${key.toUpperCase()}`,
        title: label.en ?? Object.values(label)[0] ?? key,
        // Charged per side, from the type — the line itself costs nothing.
        priceCents: 0,
        combinationHash: `send-in:${key}`,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    });
    await this.prisma.inventoryItem.create({ data: { variantId: variant.id, productId: product.id, available: 1_000_000, lowStockThreshold: 0 } });
    const row = await this.prisma.sendInItemType.create({
      data: {
        key,
        label: label as Prisma.InputJsonValue,
        hint: (parseLocalized(dto.hint) ?? undefined) as Prisma.InputJsonValue | undefined,
        variantId: variant.id,
        priceCents: fields.priceCents,
        maxChars: fields.maxChars,
        allowPuff: fields.allowPuff,
        imageKey: fields.imageKey,
        isActive: dto.isActive ?? true,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
      include: { variant: { select: { id: true, sku: true, priceCents: true } } },
    });
    return this.toAdminItemType(row, await this.assetUrls.resolveBatch(row.imageKey ? [row.imageKey] : []));
  }

  async updateItemType(id: string, dto: Partial<ItemTypeInput>) {
    const current = await this.prisma.sendInItemType.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Item type not found');
    const data: Prisma.SendInItemTypeUpdateInput = {};
    const variantData: Prisma.ProductVariantUpdateWithoutSendInItemTypeInput = {};
    if (dto.label !== undefined) {
      const label = parseLocalized(dto.label);
      if (!label || !Object.values(label).some(Boolean)) throw new BadRequestException('Give the item type a name.');
      data.label = label as Prisma.InputJsonValue;
      const title = label.en ?? Object.values(label)[0];
      if (title) variantData.title = title;
    }
    if (dto.hint !== undefined) data.hint = (parseLocalized(dto.hint) ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    if (dto.maxChars !== undefined) data.maxChars = this.int(dto.maxChars, 1, 60, 'Max characters');
    if (dto.allowPuff !== undefined) data.allowPuff = !!dto.allowPuff;
    if (dto.imageKey !== undefined) data.imageKey = dto.imageKey?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = !!dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = this.int(dto.sortOrder, -100000, 100000, 'Sort order');
    if (dto.priceCents !== undefined) data.priceCents = this.int(dto.priceCents, 0, 10_000_000, 'Price');
    if (Object.keys(variantData).length) data.variant = { update: variantData };
    const row = await this.prisma.sendInItemType.update({ where: { id }, data, include: { variant: { select: { id: true, sku: true, priceCents: true } } } });
    return this.toAdminItemType(row, await this.assetUrls.resolveBatch(row.imageKey ? [row.imageKey] : []));
  }

  /**
   * Gone for good only while nothing has been sold under it; once an order
   * carries the variant, the type is switched off instead, so old orders keep
   * a name and a price to point at.
   */
  async deleteItemType(id: string): Promise<{ deleted: boolean }> {
    const current = await this.prisma.sendInItemType.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Item type not found');
    const sold = await this.prisma.orderItem.count({ where: { variantId: current.variantId } });
    if (sold > 0) {
      await this.prisma.sendInItemType.update({ where: { id }, data: { isActive: false } });
      return { deleted: false };
    }
    // The variant's cascade takes the type row and its stock row with it.
    await this.prisma.productVariant.delete({ where: { id: current.variantId } });
    return { deleted: true };
  }

  private itemTypeFields(dto: ItemTypeInput) {
    return {
      priceCents: this.int(dto.priceCents ?? 0, 0, 10_000_000, 'Price'),
      maxChars: this.int(dto.maxChars ?? 20, 1, 60, 'Max characters'),
      allowPuff: !!dto.allowPuff,
      imageKey: dto.imageKey?.trim() || null,
    };
  }

  private int(n: unknown, min: number, max: number, what: string): number {
    const v = Number(n);
    if (!Number.isFinite(v) || v < min || v > max) throw new BadRequestException(`${what} must be between ${min} and ${max}.`);
    return Math.round(v);
  }

  private toAdminItemType(
    r: Prisma.SendInItemTypeGetPayload<{ include: { variant: { select: { id: true; sku: true; priceCents: true } } } }>,
    urls: Map<string, string>,
  ) {
    return {
      id: r.id,
      key: r.key,
      label: parseLocalized(r.label) ?? {},
      hint: parseLocalized(r.hint) ?? {},
      variantId: r.variant.id,
      sku: r.variant.sku,
      priceCents: r.priceCents,
      maxChars: r.maxChars,
      allowPuff: r.allowPuff,
      imageKey: r.imageKey,
      imageUrl: r.imageKey ? (urls.get(r.imageKey) ?? null) : null,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    };
  }
}

/** What the admin sends for an item type. Prices in cents. */
export interface ItemTypeInput {
  label: unknown;
  hint?: unknown;
  priceCents?: number;
  maxChars?: number;
  allowPuff?: boolean;
  imageKey?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}
