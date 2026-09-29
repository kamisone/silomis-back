import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { pickLocalized } from './localized.util';
import { ElementInput, PersonalizationInput } from './dto/personalization.dto';
import { SEND_IN_ARTWORK_MIN_MM } from '../send-in/send-in.constants';
import { FontGlyphService } from './font-glyph.service';
import {
  BLOCKED_TEXT_PATTERNS,
  CURVE_LIMIT_DEG,
  DEFAULT_WEIGHT_STEP,
  FIELD_MAX_HEIGHT_MM,
  FIELD_MAX_WIDTH_MM,
  FIELD_MIN_MM,
  KERNING_LIMIT,
  MAX_TEXT_LINES,
  MAX_TRAVEL_FACTOR,
  MONOGRAM_MAX_CHARS,
  MONOGRAM_MIN_CHARS,
  MOTIF_MAX_MM,
  MOTIF_MIN_MM,
  PERSONALIZATION_ERRORS as E,
  ROTATION_LIMIT_DEG,
  STITCHABLE_MONOGRAM,
  STITCHABLE_TEXT,
  TRACKING_MAX,
  TRACKING_MIN,
  weightForStep,
} from './personalization.constants';

export type ContentType = 'text' | 'monogram' | 'motif' | 'artwork';

/**
 * The customer's own logo, frozen onto a send-in design. The rendering the
 * editor showed and the original file both travel with it, so the desk can
 * hand the digitiser exactly what was uploaded.
 */
export interface ResolvedArtwork {
  key: string;
  originalKey: string;
  name: string;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
}

/** The usual embroidery leading: lines stack at 1.35× their height. */
const DEFAULT_LEADING = 1.35;

/** One shape of a full-colour design. */
export interface MotifPath {
  d: string;
  fill: string;
  /**
   * Where the shape sits, when the uploaded artwork placed it with a transform
   * rather than in its own coordinates. Carried as a string instead of being
   * folded into `d`, because folding it in means re-writing every coordinate of
   * a path — arcs included — and a transform attribute draws identically in
   * the browser and in the production sheet. Validated at ingest
   * (`svg-artwork.ts`) and again on the way out of the database.
   */
  transform?: string;
}

/** A motif frozen onto a design, with everything production needs to redraw it. */
export interface ResolvedMotif {
  key: string;
  name: string;
  path: string;
  viewBox: string;
  /** The design's own shapes and colours, when it is a full-colour one. */
  paths: MotifPath[] | null;
  /**
   * Sewn in the fills `paths` carries, rather than in the box's chosen spool.
   * Separate from `paths` because a one-colour design still needs its shapes:
   * artwork that places them with transforms cannot be flattened into a single
   * `d`, and keeping only the first would drop the rest of the drawing.
   */
  ownColours: boolean;
  /**
   * What choosing this design adds to the embroidery price, on top of the
   * position's own price. The shop's figure, per box — a licensed or fiddly
   * shape can be worth more than a plain one.
   */
  priceCents: number;
  /** The width it is stitched at. */
  sizeMm: number;
  /** The height — the drawing's own proportion unless the customer stretched it. */
  heightMm: number;
  /** Measured from a stitch-out at 30mm; the estimator scales it by area. */
  colorCount: number;
}

export interface ResolvedThread {
  id: string;
  brand: string;
  code: string;
  name: string;
  hex: string;
  /** matte | metallic | neon | glow — what the operator loads, and how it runs. */
  finish: string;
  priceMultiplier: number;
}

/** One box inside a position, checked and measured. */
export interface ResolvedElement {
  contentType: ContentType;
  /** Normalised — this exact string is what gets stitched. */
  text: string;
  /** Lines, already split — `text` is the same thing joined by newlines. */
  lines: string[];
  lineCount: number;
  fontKey: string;
  fontName: string;
  heightMm: number;
  /** 1–5 as chosen; `fontWeight` is the CSS/production value it maps to. */
  weightStep: number;
  fontWeight: number;
  /** A satin border round the letters, millimetres beyond the outline — thickness past the heaviest weight. */
  borderMm: number;
  trackingPct: number;
  kerning: number[] | null;
  /** Line spacing as a multiple of the letter height; 1.35 unless the customer set it. */
  leading: number;
  curveDeg: number;
  isPuff: boolean;
  motif: ResolvedMotif | null;
  artwork: ResolvedArtwork | null;
  /** The one spool this box is sewn in — none on the customer's own artwork, which is stitched in its own colours. */
  thread: ResolvedThread | null;
  /** Predicted width of the stitched line, for the operator and the preview. */
  widthMm: number;
  /** Each line's own predicted width — the editor draws every line at its own, and so does the sheet. */
  lineWidthsMm: number[];
  /** Every line stacked, curve included — what has to fit the area's height. */
  stackMm: number;
  /** From the area's centre, in millimetres. */
  offsetXMm: number;
  offsetYMm: number;
  /** The box's own angle in the garment's plane. */
  rotationDeg: number;
}

/**
 * A design that has passed every check, with everything the rest of the system
 * needs already derived. Nothing downstream re-reads the customer's input.
 *
 * The flat fields summarise the position for readers that never open the
 * document — the first box's face and size, every box's words joined, every
 * spool used. `elements` is the whole design.
 */
export interface ResolvedPersonalization {
  templateId: string;
  placementKey: string;
  placementLabel: string;
  contentType: ContentType;
  /** Normalised — this exact string is what gets stitched. */
  text: string;
  fontKey: string;
  fontName: string;
  heightMm: number;
  /** 1–5 as chosen; `fontWeight` is the CSS/production value it maps to. */
  weightStep: number;
  fontWeight: number;
  /** Lines, already split — `text` is the same thing joined by newlines. */
  lines: string[];
  lineCount: number;
  trackingPct: number;
  kerning: number[] | null;
  curveDeg: number;
  hasOutline: boolean;
  outlineThread: ResolvedThread | null;
  isPuff: boolean;
  motif: ResolvedMotif | null;
  /** The hoop field this design was made against, frozen with it. */
  fieldWidthMm: number;
  fieldHeightMm: number;
  threadColors: ResolvedThread[];
  /** Per unit. */
  priceCents: number;
  /** Predicted width of the stitched line, for the operator and the preview. */
  widthMm: number;
  /** Offset from the field's centre, in millimetres. Zero means centred. */
  offsetXMm: number;
  offsetYMm: number;
  /** Angle in the garment's plane. Zero means square to the traced position. */
  rotationDeg: number;
  /** Every box in the area, in the order the customer made them. */
  elements: ResolvedElement[];
  designJson: Record<string, unknown>;
  /** Stable fingerprint — two cart lines with the same design share it. */
  hash: string;
}

/** A design as it is stored on a cart line — what the order paths hand back. */
export interface CartLineDesign {
  templateId: string;
  designJson: unknown;
  placementKey: string;
  placementLabel: string;
  contentType: ContentType;
  text: string;
  fontName: string;
  fontWeight: number;
  heightMm: number;
  fieldWidthMm: number;
  fieldHeightMm: number;
  threadColors: unknown;
  offsetXMm: number;
  offsetYMm: number;
  rotationDeg: number;
  lineCount: number;
  trackingPct: number;
  kerning: unknown;
  curveDeg: number;
  hasOutline: boolean;
  outlineThread: unknown;
  isPuff: boolean;
  motifKey: string | null;
  motifName: string | null;
  motifPath: string | null;
  motifViewBox: string | null;
  motifSizeMm: number | null;
}

function fail(code: string, message: string, extra?: Record<string, unknown>): never {
  throw new BadRequestException({ code, message, ...extra });
}

@Injectable()
export class PersonalizationService {
  private readonly logger = new Logger(PersonalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    /** Optional so the specs can build the service bare; without it lettering is drawn as `<text>`. */
    private readonly glyphs?: FontGlyphService,
  ) {}

  // ── Editor configuration ─────────────────────────────────────────────

  /**
   * Everything the editor needs for one product, in one round trip: the
   * placements it may use, the faces it may set, the threads it may pick and
   * the price bands, so the browser can show a live figure without asking the
   * server on every keystroke.
   *
   * Returns null — not an error — when the product cannot be personalised, so
   * the caller can simply not render the entry point.
   */
  async getConfigForProduct(productId: string, lang?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, title: true, featuredImageKey: true, personalizationTemplateId: true, status: true },
    });
    if (!product || product.status !== 'active' || !product.personalizationTemplateId) return null;

    // The template is shop-wide policy — what may be written and what it costs
    // per stitch band. The positions themselves belong to this product.
    const [template, placements] = await Promise.all([
      this.prisma.personalizationTemplate.findUnique({ where: { id: product.personalizationTemplateId } }),
      this.prisma.personalizationPlacement.findMany({
        where: { productId: product.id, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    if (!template || !template.isActive || !placements.length) return null;

    const [fonts, threads, motifs, motifCategories] = await Promise.all([
      this.prisma.embroideryFont.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.threadColor.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.embroideryMotif.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { category: { select: { key: true, isActive: true } } },
      }),
      this.prisma.embroideryMotifCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    if (!fonts.length || !threads.length) return null;

    const imageUrls = await this.assetUrls.resolveBatch(placements.map((p) => p.mediaKey).filter(Boolean) as string[]);

    // A position with no photograph has nothing for a customer to place artwork
    // on, so it is not offered at all — and a product whose every position is
    // in that state cannot be personalised yet. A send-in position is the
    // exception: its photograph arrives with the customer.
    const offered = placements.filter((p) => p.usesCustomerPhoto || (p.mediaKey && imageUrls.get(p.mediaKey)));
    if (!offered.length) return null;

    return {
      productId: product.id,
      template: {
        id: template.id,
        key: template.key,
        name: template.name,
        allowText: template.allowText,
        allowMonogram: template.allowMonogram,
        allowUpload: template.allowUpload,
      },
      /**
       * Only positions this product can actually offer: one with no photograph
       * has nothing for the customer to place artwork on, so offering it would
       * be selling a position nobody has set up.
       */
      /** How large the customer may make the embroidery area — the machine's limits. */
      fieldLimits: { minMm: FIELD_MIN_MM, maxWidthMm: FIELD_MAX_WIDTH_MM, maxHeightMm: FIELD_MAX_HEIGHT_MM },
      placements: offered.map((p) => ({
        key: p.key,
        label: pickLocalized(p.label, lang),
        hint: pickLocalized(p.hint, lang) || null,
        /** The photo is the customer's — the editor asks for it rather than showing one. */
        usesCustomerPhoto: p.usesCustomerPhoto,
        /**
         * The scale: how many millimetres the traced panel is across, which is
         * what puts the customer's millimetres onto the photograph, and what
         * bounds how far a box may travel over it.
         *
         * No longer asked of the admin — it is `TRACED_PANEL_WIDTH_MM` for
         * every position, so the tracing itself means "the area about that wide"
         * and an admin who wants designs to preview larger traces a smaller
         * box. Only the apparent size is affected: the real limit is still the
         * derived hoop against the machine's own maximum.
         */
        fieldWidthMm: p.fieldWidthMm,
        fieldHeightMm: p.fieldHeightMm,
        priceCents: p.priceCents,
        allowPuff: p.allowPuff,
        imageUrl: p.mediaKey ? (imageUrls.get(p.mediaKey) ?? null) : null,
        /**
         * Where the embroidery area sits on this photograph, as a share of it.
         *
         * This was four corners an admin traced. They never carried more than a
         * centre and a size — they were deliberately not skewed onto the
         * artwork, so a tracing was averaged down to exactly this box before
         * anything was drawn — and asking a shop to drag four handles per
         * position bought nothing over the box itself. Only a customer still
         * sends corners, framing the panel on the photo of their own item.
         */
        preview: {
          xPct: p.previewXPct,
          yPct: p.previewYPct,
          widthPct: p.previewWidthPct,
          heightPct: p.previewHeightPct,
        },
      })),
      fonts: fonts.map((f) => ({
        key: f.key,
        name: f.name,
        webFamily: f.webFamily,
        /** A stylesheet the editor loads so the face is the same on every device. */
        webFontCss: f.webFontCss,
        minHeightMm: f.minHeightMm,
        maxHeightMm: f.maxHeightMm,
        avgCharWidthRatio: f.avgCharWidthRatio,
        supportsPuff: f.supportsPuff,
        supportsCurve: f.supportsCurve,
        // Sent so the editor can show a price that moves with the customer's
        // typing instead of a round trip per keystroke. Not a secret — it is a
        // density measurement, and the server re-derives the real figure
        // anyway before anything reaches a cart.
        uppercaseOnly: f.uppercaseOnly,
        supportsMonogram: f.supportsMonogram,
      })),
      threads: threads.map((t) => ({
        id: t.id, brand: t.brand, code: t.code, name: t.name, hex: t.hex,
        finish: t.finish, priceMultiplier: t.priceMultiplier,
      })),
      /** Shapes that can be stitched instead of words. */
      motifs: motifs.map((m) => ({
        key: m.key,
        name: pickLocalized(m.name, lang),
        path: m.path,
        viewBox: m.viewBox,
        paths: motifPaths(m.paths),
        ownColours: m.ownColours,
        // The tab's key, not its id — the editor filters on it and nothing
        // stores it. A design whose tab has been switched off falls back to
        // showing only under "All", the same as an uncategorised one.
        category: m.category?.isActive ? m.category.key : null,
      })),
      /**
       * The library's tabs, in the shop's own order. Sent with their names
       * already picked for this language: they are admin data, so the
       * storefront has no compiled-in list to translate them against.
       */
      motifCategories: motifCategories.map((c) => ({ key: c.key, name: pickLocalized(c.name, lang) })),
    };
  }

  // ── Validation, estimation and pricing ───────────────────────────────

  /**
   * The one path every design goes through, whether it arrived from the
   * editor's live quote or from add-to-cart. Throws a coded BadRequest on the
   * first rule it breaks; the storefront turns the code into translated copy.
   *
   * A design is one position: the area the customer sized and moved, and the
   * boxes inside it. Every box is checked on its own — its words, face, size
   * and spool — and the position is then priced as a whole, because one hoop
   * is one run on the machine however many boxes it carries.
   */
  async resolve(productId: string, input: PersonalizationInput, lang?: string): Promise<ResolvedPersonalization> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { personalizationTemplateId: true, status: true },
    });
    if (!product || product.status !== 'active' || !product.personalizationTemplateId) {
      fail(E.NOT_AVAILABLE, 'This product cannot be personalised.');
    }

    const [template, placement] = await Promise.all([
      this.prisma.personalizationTemplate.findUnique({ where: { id: product.personalizationTemplateId } }),
      this.prisma.personalizationPlacement.findUnique({
        where: { productId_key: { productId, key: input.placementKey } },
      }),
    ]);
    if (!template?.isActive) fail(E.NOT_AVAILABLE, 'This product cannot be personalised.');
    if (!placement?.isActive) fail(E.PLACEMENT_UNKNOWN, 'That embroidery position is not available.');

    // A send-in position has no photo of its own: the customer's item is the
    // photo, and the panel they framed and measured stands in for the shop's
    // tracing. Anywhere else, the same rule getConfigForProduct applies when
    // deciding what to offer — enforced here too because the config is a
    // convenience for the editor and this is the only path into a cart:
    // without it a crafted request could buy a position with no artwork
    // behind it, and the job would reach the floor with nothing to show.
    const customerItem = input.customerItem ?? null;
    let sideFeeCents = 0;
    if (placement.usesCustomerPhoto) {
      if (!customerItem) fail(E.PLACEMENT_UNKNOWN, 'This position needs a photo of your item.');
      // The item type is the shop's list, not a fixed enum: a type retired in
      // the admin must stop being orderable at once.
      // The admin's switch over the whole service: off means nothing on a
      // customer's own item is accepted, whatever is already in a basket.
      const gate = await this.prisma.platformSettings.findUnique({ where: { key: 'send_in_enabled' } });
      if (gate && gate.value !== 'true') fail(E.PLACEMENT_UNKNOWN, 'Embroidery on your own item is not available at the moment.');
      const itemType = await this.prisma.sendInItemType.findUnique({ where: { key: customerItem.itemType }, select: { isActive: true, priceCents: true } });
      if (!itemType?.isActive) fail(E.PLACEMENT_UNKNOWN, 'That kind of item is not accepted at the moment.');
      // The whole price of a side: handling, return postage and the run,
      // charged once per side. What the customer draws on it does not move
      // the figure — see the pricing below.
      sideFeeCents = itemType.priceCents;
    } else {
      if (customerItem) fail(E.PLACEMENT_UNKNOWN, 'That embroidery position takes no customer photo.');
      if (!placement.mediaKey) fail(E.PLACEMENT_UNKNOWN, 'That embroidery position is not set up yet.');
    }
    // The panel every box travels over. On the customer's own item it is the
    // side position's field laid over the rectangle framed on their photo —
    // the one scale the admin sets, like any other position's.
    const panel = placement;
    // How big a box may be. A catalogue position is bounded by the largest
    // hoop; the customer's own item by their photograph — the panel's real
    // size scaled up to the whole picture — because on their own item they
    // decide, and a design that fills the photo is a design that fills it.
    const bounds = customerItem ? photoExtentMm(customerItem.corners, panel) : { maxWidthMm: FIELD_MAX_WIDTH_MM, maxHeightMm: FIELD_MAX_HEIGHT_MM };

    // Sequential rather than parallel on purpose: the first thing wrong should
    // be the thing reported, and a Promise.all would race two rejections and
    // surface whichever lost. The error names the box, so the editor can open
    // the right one.
    const elements: ResolvedElement[] = [];
    for (let i = 0; i < input.elements.length; i++) {
      try {
        elements.push(await this.resolveElement(input.elements[i], { template, placement: panel, bounds }));
      } catch (err) {
        if (err instanceof BadRequestException) {
          const body = err.getResponse() as Record<string, unknown>;
          throw new BadRequestException({ ...body, elementIndex: i });
        }
        throw err;
      }
    }

    // The hoop is not something the customer draws: it is whatever rectangle
    // holds every box they placed, plus the clearance a frame needs round the
    // stitching. Measured on the boxes' real footprints — a turned box reaches
    // further than its sides — so the operator's sheet holds all of it.
    const hoop = hoopAround(elements);
    if (hoop.widthMm > bounds.maxWidthMm) {
      fail(E.TOO_WIDE, `Those boxes spread wider than we can hoop in one go (${Math.round(bounds.maxWidthMm)}mm) — bring them closer or make them smaller.`, {
        widthMm: Math.round(hoop.widthMm),
        fieldWidthMm: Math.round(bounds.maxWidthMm),
      });
    }
    if (hoop.heightMm > bounds.maxHeightMm) {
      fail(E.TOO_TALL, `Those boxes spread taller than we can hoop in one go (${Math.round(bounds.maxHeightMm)}mm) — bring them closer or make them smaller.`, {
        heightMm: Math.round(hoop.heightMm),
        fieldHeightMm: Math.round(bounds.maxHeightMm),
      });
    }
    const fieldWidthMm = hoop.widthMm;
    const fieldHeightMm = hoop.heightMm;
    // Where the hoop sits: its centre, from the position's traced centre. The
    // boxes are then re-expressed from that centre, which is how the sheet
    // draws them and how the operator reads them off it.
    const offsetXMm = hoop.cxMm;
    const offsetYMm = hoop.cyMm;
    for (const el of elements) {
      el.offsetXMm = round1(el.offsetXMm - offsetXMm);
      el.offsetYMm = round1(el.offsetYMm - offsetYMm);
    }

    // Threads are de-duplicated before counting: two boxes in the same spool
    // are one colour on the machine, so charging a colour change for the
    // second would be wrong. Order is the order the boxes were made in, which
    // is the order the operator loads them.
    const threads: ResolvedThread[] = [];
    for (const el of elements) {
      const t = el.thread;
      if (t && !threads.some((x) => x.id === t.id)) threads.push(t);
    }
    // No colour cap: a box carries one spool and there are at most
    // MAX_ELEMENTS boxes, so the number of spools on a hoop is already bounded
    // by something real. A separate per-position number only ever refused a
    // design the machine could have run.

    // Each box carries its own glyph stitches and its own underlay; the
    // colour changes belong to the position, because that is where they
    // happen — between one box's spool and the next.
    const placementLabel = pickLocalized(placement.label, lang);

    /**
     * What the embroidery costs.
     *
     * Every term is a figure the shop typed, and every term answers to
     * something the customer did:
     *
     * - the POSITION's own price, once per position, for the hooping and the
     *   run — two positions are two of those, because the shop does the work
     *   twice, while a second box on one position is not, so it adds nothing;
     * - each DESIGN's own surcharge, per box, for a shape the shop prices above
     *   the plain ones.
     *
     * It used to be led by an estimated stitch count against a ladder of price
     * bands. That was the honest unit — machine time IS stitches — but only a
     * real digitised file has a stitch count; ours was a parametric guess from
     * a per-face average, a height exponent the code itself documented as
     * "1.2–1.4 in practice", and a handful of uncalibrated multipliers. A
     * continuous or banded price off that guess put its whole error on the
     * invoice, and nothing ever compared the guess to a digitiser's actual
     * figure. A price the shop states is one it can stand behind.
     *
     * A metallic or glow thread still costs more to run, and its multiplier is
     * still on the row, but it is not applied here: it multiplied the band, and
     * a multiplier on a flat position fee gives a figure nobody chose (€10
     * becomes €13.50). If that cost should be charged again it belongs as a
     * flat surcharge on the spool, stated the same way as everything else.
     */
    const designCents = elements.reduce((sum, el) => sum + (el.motif?.priceCents ?? 0), 0);
    // A send-in side is a flat fee — the item type's price. The customer was
    // quoted one figure per side when they chose the item, so only what they
    // then knowingly added to it moves the total.
    const priceCents = customerItem ? sideFeeCents + designCents : placement.priceCents + designCents;

    // The row keeps a flat summary of the position for everything that reads a
    // design without opening the document — the queue's card, a search, an
    // email — while the document carries every box in full.
    const first = elements[0];
    const firstText = elements.find((el) => el.contentType !== 'motif' && el.contentType !== 'artwork') ?? first;
    const text = elements.map((el) => el.text).filter(Boolean).join('\n');
    const lines = elements.flatMap((el) => el.lines);
    const kinds = new Set(elements.map((el) => el.contentType));
    const contentType = kinds.size === 1 ? first.contentType : 'text';
    const firstMotif = elements.find((el) => el.motif)?.motif ?? null;

    const designJson = {
      version: 2 as const,
      templateKey: template.key,
      placementKey: placement.key,
      // The label travels with the design so a basket, an order confirmation
      // and a refund six months later all read the same words, even if the
      // shop has since renamed or deleted the position.
      placementLabel,
      // Derived from the boxes, but frozen with the design: the sheet is drawn
      // from this, and a later change to the clearance rule must not redraw a
      // job already sold.
      field: { widthMm: fieldWidthMm, heightMm: fieldHeightMm },
      offsetXMm,
      offsetYMm,
      // The customer's item, frozen with the design: the job that tracks the
      // parcel is created from this when the order is placed.
      customerItem: customerItem
        ? {
            itemType: customerItem.itemType,
            sideFeeCents,
            photoKeys: customerItem.photoKeys,
            corners: customerItem.corners,
            panelWidthMm: panel.fieldWidthMm,
            panelHeightMm: panel.fieldHeightMm,
            note: customerItem.note?.trim() || null,
          }
        : null,
      elements: elements.map((el) => ({
        contentType: el.contentType,
        text: el.text,
        lines: el.lines,
        font: { key: el.fontKey, name: el.fontName },
        heightMm: el.heightMm,
        weightStep: el.weightStep,
        fontWeight: el.fontWeight,
        borderMm: el.borderMm,
        trackingPct: el.trackingPct,
        leading: el.leading,
        kerning: el.kerning,
        curveDeg: el.curveDeg,
        isPuff: el.isPuff,
        // Path and viewBox travel with the document: retiring a motif from the
        // catalogue must not leave an ordered job with nothing to redraw.
        motif: el.motif
          ? {
              key: el.motif.key, name: el.motif.name, sizeMm: el.motif.sizeMm, heightMm: el.motif.heightMm,
              path: el.motif.path, viewBox: el.motif.viewBox, paths: el.motif.paths, ownColours: el.motif.ownColours,
              priceCents: el.motif.priceCents,
            }
          : null,
        // Both files by key: the rendering for every later picture of this
        // design, the original for the digitiser.
        artwork: el.artwork,
        widthMm: el.widthMm,
        lineWidthsMm: el.lineWidthsMm,
        stackMm: el.stackMm,
        offsetXMm: el.offsetXMm,
        offsetYMm: el.offsetYMm,
        rotationDeg: el.rotationDeg,
        thread: el.thread ? { brand: el.thread.brand, code: el.thread.code, name: el.thread.name, hex: el.thread.hex } : null,
      })),
      threads: threads.map((t) => ({ brand: t.brand, code: t.code, name: t.name, hex: t.hex })),
      priceCents,
    };

    return {
      templateId: template.id,
      placementKey: placement.key,
      placementLabel,
      contentType,
      text,
      fontKey: firstText.fontKey,
      fontName: firstText.fontName,
      heightMm: firstText.heightMm,
      weightStep: firstText.weightStep,
      fontWeight: firstText.fontWeight,
      lines,
      lineCount: lines.length,
      trackingPct: firstText.trackingPct,
      kerning: firstText.kerning,
      curveDeg: firstText.curveDeg,
      hasOutline: false,
      outlineThread: null,
      isPuff: elements.some((el) => el.isPuff),
      motif: firstMotif,
      fieldWidthMm,
      fieldHeightMm,
      threadColors: threads,
      priceCents,
      widthMm: round1(Math.max(...elements.map((el) => el.widthMm))),
      offsetXMm,
      offsetYMm,
      // The area itself is never turned; each box carries its own angle.
      rotationDeg: 0,
      elements,
      designJson,
      hash: this.hashDesign(designJson),
    };
  }

  /**
   * One box, checked and measured on its own: its words against the face and
   * the position's character limit, its size against the face and the area,
   * its spool, and everything the tools set.
   */
  private async resolveElement(
    input: ElementInput,
    ctx: {
      template: { allowText: boolean; allowMonogram: boolean };
      placement: { allowPuff: boolean; fieldWidthMm: number; fieldHeightMm: number; usesCustomerPhoto?: boolean };
      /** The most a box may measure: the hoop on a catalogue position, the photograph on the customer's own item. */
      bounds: { maxWidthMm: number; maxHeightMm: number };
    },
  ): Promise<ResolvedElement> {
    const { template, placement, bounds } = ctx;

    // The customer's own logo is its own path: no words, no face, no spool —
    // the shop digitises the file as it is. Only on their own item, because
    // that is the only place the shop has agreed to digitise on demand.
    if (input.contentType === 'artwork') {
      if (!placement.usesCustomerPhoto) fail(E.CONTENT_TYPE_DISABLED, 'Your own artwork can only be embroidered on your own item.');
      return this.resolveArtworkElement(input, placement, bounds);
    }

    if (input.contentType === 'text' && !template.allowText) {
      fail(E.CONTENT_TYPE_DISABLED, 'Text embroidery is not offered on this product.');
    }
    if (input.contentType === 'monogram' && !template.allowMonogram) {
      fail(E.CONTENT_TYPE_DISABLED, 'Monograms are not offered on this product.');
    }

    // A motif is stitched instead of words, so it skips the whole text path.
    // A shape on a catalogue position is capped like any motif; on the
    // customer's own item it may grow to the photograph.
    const motifMax = placement.usesCustomerPhoto ? Math.min(bounds.maxWidthMm, bounds.maxHeightMm) : MOTIF_MAX_MM;
    const motif = input.motifKey ? await this.resolveMotif(input.motifKey, input.motifSizeMm, input.motifHeightMm, motifMax, bounds.maxHeightMm) : null;
    if (input.contentType === 'motif' && !motif) fail(E.MOTIF_UNKNOWN, 'That shape is not available.');

    const font = await this.prisma.embroideryFont.findUnique({ where: { key: input.fontKey } });
    if (!font?.isActive) fail(E.FONT_UNKNOWN, 'That embroidery font is not available.');
    if (input.contentType === 'monogram' && !font.supportsMonogram) {
      fail(E.FONT_UNKNOWN, 'That font cannot be used for a monogram.');
    }

    const lines = this.normalizeLines(input.text, input.contentType, font.uppercaseOnly);
    const text = lines.join('\n');
    if (input.contentType !== 'motif') {
      // Dropping blank lines means an input of nothing but whitespace leaves an
      // empty array rather than an empty string — without this the "enter some
      // text" check below never ran and a blank design was accepted.
      if (!lines.length) fail(E.TEXT_EMPTY, 'Enter the text to embroider.');
      if (lines.length > MAX_TEXT_LINES) {
        fail(E.TOO_MANY_LINES, `At most ${MAX_TEXT_LINES} lines.`, { maxLines: MAX_TEXT_LINES });
      }
      for (const line of lines) this.assertTextIsStitchable(line, input.contentType);
    }

    // A full-colour design carries its own spools; everything else is sewn in one the customer picks.
    const ownColours = input.contentType === 'motif' && !!motif?.ownColours;
    if (!input.threadColorId && !ownColours) fail(E.THREAD_UNKNOWN, 'Pick a thread colour.');
    const thread = ownColours || !input.threadColorId ? null : (await this.resolveThreads([input.threadColorId]))[0];

    const heightMm = round1(input.heightMm);
    // A face has a height it stitches well at; on the customer's own item the
    // customer decides, and the only ceiling is the photograph.
    const maxHeightMm = placement.usesCustomerPhoto ? bounds.maxHeightMm : font.maxHeightMm;
    if (input.contentType !== 'motif' && (heightMm < font.minHeightMm || heightMm > maxHeightMm)) {
      fail(E.HEIGHT_OUT_OF_RANGE, `Letter height must be between ${font.minHeightMm}mm and ${maxHeightMm}mm.`, {
        minHeightMm: font.minHeightMm,
        maxHeightMm,
      });
    }

    const weight = weightForStep(input.weight);
    // Thickness past the heaviest face: a satin border round the letters. The
    // customer's own item is the one place it is theirs to set — and there
    // it is bounded only like everything else on their photo.
    const borderMm = placement.usesCustomerPhoto && input.contentType !== 'motif' ? round1(clamp(input.borderMm ?? 0, 0, bounds.maxHeightMm)) : 0;

    const trackingPct = round2(clamp(input.trackingPct ?? 0, TRACKING_MIN, TRACKING_MAX));
    const leading = round2(clamp(input.leading ?? DEFAULT_LEADING, 0.8, 3));
    // One nudge per gap between glyphs on the longest line — anything the
    // browser sent beyond that describes gaps that do not exist.
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
    const gapCount = Math.max(0, longest.length - 1);
    const kerning =
      input.kerning?.length && gapCount
        ? Array.from({ length: gapCount }, (_, i) => round2(clamp(input.kerning![i] ?? 0, -KERNING_LIMIT, KERNING_LIMIT)))
        : null;

    if (input.curveDeg && !font.supportsCurve) {
      fail(E.CURVE_UNAVAILABLE, 'That font cannot be curved.');
    }
    const curveDeg = round1(clamp(input.curveDeg ?? 0, -CURVE_LIMIT_DEG, CURVE_LIMIT_DEG));

    const isPuff = !!input.puff;
    if (isPuff && (!placement.allowPuff || !font.supportsPuff)) {
      // Refused rather than quietly dropped: a customer who chose puff and was
      // charged for a flat stitch-out would have every right to complain.
      fail(E.PUFF_UNAVAILABLE, '3D puff is not available for this position or font.');
    }

    // Every line at its own measured width — the widest is what has to fit.
    // (Measuring the joined text counted every line end to end — and the
    // newlines between them — so a two-line name was refused as twice its
    // real width.)
    const lineWidthsMm = lines.map((line) =>
      round1(this.estimateWidthMm(line, heightMm, font.avgCharWidthRatio, input.contentType) * weight.widthFactor + this.spacingWidthMm(line, heightMm, trackingPct, line === longest ? kerning : null) + 2 * borderMm),
    );
    const widthMm =
      motif && input.contentType === 'motif'
        ? motif.sizeMm
        : this.estimateWidthMm(longest, heightMm, font.avgCharWidthRatio, input.contentType) * weight.widthFactor +
          this.spacingWidthMm(longest, heightMm, trackingPct, kerning) +
          2 * borderMm;
    // A single box has to fit the machine's largest frame on its own; the
    // whole position is checked again once every box is placed.
    if (widthMm > bounds.maxWidthMm) {
      fail(E.TOO_WIDE, `That is wider than we can embroider in one go (${Math.round(bounds.maxWidthMm)}mm) — shorten the text or reduce the size.`, {
        widthMm: Math.round(widthMm),
        fieldWidthMm: Math.round(bounds.maxWidthMm),
      });
    }

    // Stacked lines and a curve both eat height. A curved line rises by the
    // sagitta of its arc, which is what makes an arch overflow a shallow field
    // long before its letters would.
    const stackMm = this.stackHeightMm({
      lineCount: lines.length,
      heightMm,
      widthMm,
      curveDeg,
      motif,
      contentType: input.contentType,
      leading,
    });
    const stackWithBorderMm = stackMm + 2 * borderMm;
    if (stackWithBorderMm > bounds.maxHeightMm) {
      fail(E.TOO_TALL, `That is taller than we can embroider in one go (${Math.round(bounds.maxHeightMm)}mm) — fewer lines, less curve, or a smaller size.`, {
        heightMm: Math.round(stackWithBorderMm),
        fieldHeightMm: Math.round(bounds.maxHeightMm),
      });
    }

    // Where the box sits, from the position's traced centre. The bound is how
    // far anything may travel over the photograph — MAX_TRAVEL_FACTOR × the
    // traced panel, the same rule the editor applies. Clamped rather than
    // rejected, because a drag that ran past the limit should stop there,
    // which is what the pointer was already being shown; an error message for
    // a gesture the editor visibly constrained would be nonsense.
    //
    // Rounded *after* clamping, not before: the bound is a product of measured
    // numbers and lands on values like 164.99999999999997, which would reach
    // the operator's printed sheet verbatim.
    const maxTravelX = placement.fieldWidthMm * MAX_TRAVEL_FACTOR;
    const maxTravelY = placement.fieldHeightMm * MAX_TRAVEL_FACTOR;
    const offsetXMm = round1(clamp(input.offsetXMm ?? 0, -maxTravelX, maxTravelX));
    const offsetYMm = round1(clamp(input.offsetYMm ?? 0, -maxTravelY, maxTravelY));

    // Normalised to a single turn so that 370° and 10° are one design rather
    // than two cart lines that stitch identically.
    const rotationDeg = round1(normalizeAngle(input.rotationDeg ?? 0));

    return {
      contentType: input.contentType,
      text,
      lines,
      lineCount: lines.length,
      fontKey: font.key,
      fontName: font.name,
      heightMm,
      weightStep: weight.step,
      fontWeight: weight.cssWeight,
      borderMm,
      trackingPct,
      kerning,
      leading,
      curveDeg,
      isPuff,
      motif,
      artwork: null,
      thread,
      widthMm: round1(widthMm),
      lineWidthsMm,
      stackMm: round1(stackWithBorderMm),
      offsetXMm,
      offsetYMm,
      rotationDeg,
    };
  }

  /**
   * Resolves every position a customer chose, and totals them.
   *
   * Sequential rather than parallel on purpose: the first thing wrong should
   * be the thing reported, and a Promise.all would race two rejections and
   * surface whichever lost. The set is also sorted by placement key before
   * hashing, so choosing front-then-back and back-then-front produce one cart
   * line rather than two identical ones.
   */
  async resolveSet(
    productId: string,
    inputs: PersonalizationInput[],
    lang?: string,
  ): Promise<{ designs: ResolvedPersonalization[]; totalCents: number; hash: string }> {
    const designs: ResolvedPersonalization[] = [];
    for (const input of inputs) {
      designs.push(await this.resolve(productId, input, lang));
    }
    designs.sort((a, b) => (a.placementKey < b.placementKey ? -1 : a.placementKey > b.placementKey ? 1 : 0));

    return {
      designs,
      totalCents: designs.reduce((sum, d) => sum + d.priceCents, 0),
      hash: this.hashDesign({ version: 1, designs: designs.map((d) => d.designJson) }),
    };
  }

  // ── Normalisation ────────────────────────────────────────────────────

  /**
   * What the customer typed becomes what the machine sews, so this runs before
   * validation rather than after: the length and charset checks below must see
   * the final string, not the draft.
   */
  /**
   * Splits on newlines and normalises each line.
   *
   * Blank lines are dropped rather than stitched: a machine does not sew an
   * empty row, and keeping one would push the rest of the design off centre by
   * a line's height for no reason.
   */
  /**
   * The customer's uploaded logo as a box: sized by the width they chose,
   * its height following the file's proportions, its stitches estimated from
   * the drawn area. The upload row is the proof the file exists and was
   * ours to render — a key that was never uploaded is refused.
   */
  private async resolveArtworkElement(
    input: ElementInput,
    placement: { fieldWidthMm: number; fieldHeightMm: number },
    bounds: { maxWidthMm: number; maxHeightMm: number },
  ): Promise<ResolvedElement> {
    const art = input.artworkKey ? await this.prisma.sendInArtwork.findUnique({ where: { key: input.artworkKey } }) : null;
    if (!art) fail(E.ARTWORK_UNKNOWN, 'Upload your logo first.');

    // As wide as the photograph allows — the logo may fill the picture.
    const widthMm = round1(clamp(input.artworkSizeMm ?? 60, SEND_IN_ARTWORK_MIN_MM, bounds.maxWidthMm));
    // The file's own proportion, unless the customer stretched it.
    const heightMm = round1(clamp(input.artworkHeightMm ?? (widthMm * art.heightPx) / Math.max(1, art.widthPx), 1, bounds.maxHeightMm));
    if (heightMm > bounds.maxHeightMm) {
      fail(E.TOO_TALL, `That is taller than the photo (${Math.round(bounds.maxHeightMm)}mm) — make it smaller.`, { heightMm, fieldHeightMm: Math.round(bounds.maxHeightMm) });
    }

    const maxTravelX = placement.fieldWidthMm * MAX_TRAVEL_FACTOR;
    const maxTravelY = placement.fieldHeightMm * MAX_TRAVEL_FACTOR;

    return {
      contentType: 'artwork',
      text: '',
      lines: [],
      lineCount: 0,
      fontKey: input.fontKey,
      fontName: '',
      heightMm,
      weightStep: 3,
      fontWeight: 400,
      borderMm: 0,
      trackingPct: 0,
      leading: DEFAULT_LEADING,
      kerning: null,
      curveDeg: 0,
      isPuff: false,
      motif: null,
      artwork: {
        key: art.key,
        originalKey: art.originalKey,
        name: art.originalName,
        widthMm,
        heightMm,
        widthPx: art.widthPx,
        heightPx: art.heightPx,
      },
      thread: null,
      widthMm,
      lineWidthsMm: [],
      stackMm: heightMm,
      offsetXMm: round1(clamp(input.offsetXMm ?? 0, -maxTravelX, maxTravelX)),
      offsetYMm: round1(clamp(input.offsetYMm ?? 0, -maxTravelY, maxTravelY)),
      rotationDeg: round1(normalizeAngle(input.rotationDeg ?? 0)),
    };
  }

  private normalizeLines(raw: string, contentType: ContentType, uppercaseOnly: boolean): string[] {
    if (contentType === 'motif') return [];
    return raw
      .split(/\r?\n/)
      .map((line) => this.normalizeText(line, contentType, uppercaseOnly))
      .filter(Boolean);
  }

  /**
   * Extra width the spacing controls add.
   *
   * Tracking opens every gap by a fraction of cap height; kerning nudges them
   * one at a time on top. Both are measured in gaps, not glyphs — five letters
   * have four gaps, which is also why closing a gap can never pull the line
   * shorter than the glyphs themselves.
   */
  private spacingWidthMm(longestLine: string, heightMm: number, trackingPct: number, kerning: number[] | null): number {
    const gaps = Math.max(0, longestLine.length - 1);
    const kernSum = kerning ? kerning.reduce((sum, k) => sum + k, 0) : 0;
    return (gaps * trackingPct + kernSum) * heightMm;
  }

  /**
   * How tall the whole design stands, which is not the same as letter height.
   *
   * Lines stack at 1.35× their height — the usual leading for embroidery, where
   * ascenders and descenders cannot be allowed to touch across rows. A curve
   * adds its sagitta: bending a line along an arc lifts its ends above its
   * middle, and that rise is what overflows a shallow field long before the
   * letters would.
   */
  private stackHeightMm(args: {
    lineCount: number;
    heightMm: number;
    widthMm: number;
    curveDeg: number;
    motif: ResolvedMotif | null;
    contentType: ContentType;
    leading?: number;
  }): number {
    if (args.contentType === 'motif') return args.motif?.heightMm ?? args.motif?.sizeMm ?? 0;

    const leading = args.leading ?? DEFAULT_LEADING;
    const stack = Math.max(1, args.lineCount) * args.heightMm * (args.lineCount > 1 ? leading : 1);
    if (!args.curveDeg) return stack;

    // Sagitta of the arc — how far the middle of a bent line sits from the
    // straight one between its ends. It is a function of the CHORD, not of the
    // letter height: a long word bent 60° rises far more than a short one at
    // the same angle, which is exactly why an arch overflows a shallow field
    // while its letters would have fitted easily.
    const half = (Math.abs(args.curveDeg) * Math.PI) / 360;
    if (half <= 0) return stack;
    const radius = args.widthMm / (2 * Math.sin(half));
    const sagitta = radius - radius * Math.cos(half);
    return stack + sagitta;
  }

  private async resolveMotif(key: string, sizeMm: number | undefined, heightMm: number | undefined, maxMm: number, maxHeightMm: number): Promise<ResolvedMotif | null> {
    const motif = await this.prisma.embroideryMotif.findUnique({ where: { key } });
    if (!motif?.isActive) return null;
    const size = round1(sizeMm ?? 30);
    if (size < MOTIF_MIN_MM || size > maxMm) {
      fail(E.MOTIF_SIZE, `A shape has to be between ${MOTIF_MIN_MM}mm and ${Math.round(maxMm)}mm.`);
    }
    // Width and height are the customer's separately: the drawing's own
    // proportion unless they stretched it one way.
    const [, , vw, vh] = motif.viewBox.split(/\s+/).map(Number);
    const aspect = (vh || 100) / (vw || 100);
    const height = round1(heightMm ?? size * aspect);
    if (height < MOTIF_MIN_MM || height > Math.max(maxMm, maxHeightMm)) {
      fail(E.MOTIF_SIZE, `A shape has to be between ${MOTIF_MIN_MM}mm and ${Math.round(Math.max(maxMm, maxHeightMm))}mm tall.`);
    }
    return {
      key: motif.key,
      name: pickLocalized(motif.name),
      path: motif.path,
      viewBox: motif.viewBox,
      paths: motifPaths(motif.paths),
      ownColours: motif.ownColours,
      priceCents: motif.priceCents,
      sizeMm: size,
      heightMm: height,
      colorCount: motif.colorCount,
    };
  }

  private normalizeText(raw: string, contentType: ContentType, uppercaseOnly: boolean): string {
    // NFC first — "é" typed as e + combining accent is two code points, which
    // would both overrun the character limit and reach the face as a glyph it
    // does not have.
    let text = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (contentType === 'monogram') text = text.replace(/\s/g, '').toUpperCase();
    else if (uppercaseOnly) text = text.toUpperCase();
    return text;
  }

  /**
   * No length limit. A position used to carry a `maxChars`, which was a second,
   * arbitrary answer to a question the geometry already answers: the design is
   * measured and refused if the hoop round it will not fit
   * (`TOO_WIDE`/`TOO_TALL`). A count could only ever disagree with that — a
   * narrow font fitted far more characters than the number allowed, a wide one
   * overran while still under it — so the customer writes what they like and
   * the measurement decides.
   */
  private assertTextIsStitchable(text: string, contentType: ContentType): void {
    if (!text) fail(E.TEXT_EMPTY, 'Enter the text to embroider.');

    if (contentType === 'monogram') {
      if (text.length < MONOGRAM_MIN_CHARS || text.length > MONOGRAM_MAX_CHARS) {
        fail(E.MONOGRAM_LENGTH, `A monogram is ${MONOGRAM_MIN_CHARS} or ${MONOGRAM_MAX_CHARS} letters.`);
      }
      if (!STITCHABLE_MONOGRAM.test(text)) {
        fail(E.TEXT_UNSTITCHABLE, 'A monogram can only use letters.');
      }
    } else {
      if (!STITCHABLE_TEXT.test(text)) {
        fail(E.TEXT_UNSTITCHABLE, 'Some of those characters cannot be embroidered.');
      }
    }

    if (BLOCKED_TEXT_PATTERNS.some((re) => re.test(text))) {
      fail(E.TEXT_BLOCKED, 'We cannot embroider that text.');
    }
  }

  private async resolveThreads(ids: string[]): Promise<ResolvedThread[]> {
    const unique = [...new Set(ids)];
    const rows = await this.prisma.threadColor.findMany({ where: { id: { in: unique }, isActive: true } });
    if (rows.length !== unique.length) fail(E.THREAD_UNKNOWN, 'One of those thread colours is no longer available.');
    // Preserve the customer's order — the first colour is the one the design
    // reads as, and the operator loads them in sequence.
    const byId = new Map(rows.map((r) => [r.id, r]));
    return unique.map((id) => {
      const r = byId.get(id)!;
      return {
        id: r.id, brand: r.brand, code: r.code, name: r.name, hex: r.hex,
        finish: r.finish, priceMultiplier: r.priceMultiplier,
      };
    });
  }

  // ── Estimation ───────────────────────────────────────────────────────

  /**
   * Predicted width of the stitched line. Deliberately an over-estimate: a
   * design that turns out narrower than predicted is a non-event, while one
   * that turns out wider does not fit the hoop and the order stops on the
   * floor. Spaces are counted at half an advance, which is what a face does.
   */
  private estimateWidthMm(text: string, heightMm: number, avgCharWidthRatio: number, contentType: ContentType): number {
    const advances = [...text].reduce((sum, ch) => sum + (ch === ' ' ? 0.5 : 1), 0);
    const base = advances * heightMm * avgCharWidthRatio;
    // A monogram's letters interlock and the centre letter is drawn larger, so
    // it is wider than the same three characters set as text.
    return contentType === 'monogram' ? base * 1.25 : base;
  }

  // ── Fingerprint ──────────────────────────────────────────────────────

  /**
   * Identity of a design, used as the third column of the cart's unique key.
   *
   * Built from the *resolved* document rather than the request, so two editors
   * that reach the same design by different routes (a different thread id
   * order, a height typed as 20 vs 20.0) produce one cart line, and any real
   * difference produces two.
   */
  private hashDesign(design: Record<string, unknown>): string {
    return createHash('sha256').update(stableStringify(design)).digest('hex');
  }

  // ── Production artwork ───────────────────────────────────────────────

  /**
   * The digitiser's handoff: vector artwork whose user units are millimetres,
   * so it opens at the size it will be sewn and nobody has to re-measure. The
   * dashed rectangle is the placement's hoop field, which is what makes an
   * out-of-bounds design obvious at a glance.
   *
   * Generated here, from the resolved design — never accepted from a browser.
   */
  /**
   * The artwork itself: a motif, or the lines of lettering.
   *
   * Everything is drawn around (0,0) so the caller's one transform can place,
   * turn and offset it — the frame and the stitching can never end up
   * disagreeing about where they are.
   */
  private artworkBody(r: ResolvedElement, fontSizeMm: number, color: string, idPrefix: string, images?: Map<string, string>): string[] {
    if (r.artwork) {
      // The customer's own file, at the size they chose. With the rendering
      // in hand (the mockup) it is the picture itself; without it (a sheet
      // built inline, at checkout) a labelled frame marks where it goes —
      // the digitiser works from the original file, not from this.
      const w = r.artwork.widthMm;
      const h = r.artwork.heightMm;
      const data = images?.get(r.artwork.key);
      if (data) {
        return [`<image href="data:image/png;base64,${data}" x="${round1(-w / 2)}" y="${round1(-h / 2)}" width="${round1(w)}" height="${round1(h)}" preserveAspectRatio="xMidYMid meet"/>`];
      }
      return [
        `<rect x="${round1(-w / 2)}" y="${round1(-h / 2)}" width="${round1(w)}" height="${round1(h)}" fill="none" stroke="${escapeXml(color)}" stroke-width="0.4" stroke-dasharray="2 1.5"/>`,
        `<text x="0" y="0" font-family="sans-serif" font-size="${Math.max(2, Math.min(6, h / 4)).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${escapeXml(color)}">${escapeXml(r.artwork.name)}</text>`,
      ];
    }
    if (r.motif) {
      // The path is authored in its own viewBox, so it is scaled to the size
      // the customer chose and centred on the origin.
      const [, , vw, vh] = r.motif.viewBox.split(/\s+/).map(Number);
      // Width and height scale on their own, so a stretched shape stretches.
      const sx = r.motif.sizeMm / (vw || 100);
      const sy = (r.motif.heightMm || r.motif.sizeMm) / (vh || 100);
      const tx = -((vw || 100) * sx) / 2;
      const ty = -((vh || 100) * sy) / 2;
      // The shapes are the drawing; `ownColours` only decides what fills them.
      // A one-spool design still draws every shape — sewing just the first
      // would leave most of the artwork off the cap. Designs seeded before the
      // shapes existed have only the single silhouette path.
      const shapes = r.motif.paths?.length
        ? r.motif.paths.map(
            (p) => `<path d="${escapeXml(p.d)}" fill="${escapeXml(r.motif!.ownColours ? p.fill : color)}"${p.transform ? ` transform="${escapeXml(p.transform)}"` : ''}/>`,
          )
        : [`<path d="${escapeXml(r.motif.path)}" fill="${escapeXml(color)}"/>`];
      return [`<g transform="translate(${round1(tx)} ${round1(ty)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">`, ...shapes, `</g>`];
    }

    const lines = r.lines.length ? r.lines : [r.text];
    // The same leading the height check used — a sheet that stacked its
    // lines differently from the rule that accepted them would be showing
    // the operator a design the shop never agreed to.
    const lead = fontSizeMm * 0.72 * (r.leading || DEFAULT_LEADING);
    const firstY = -((lines.length - 1) * lead) / 2;
    // The width each line was quoted, validated and previewed at. Forcing it
    // here too means the sheet, the editor and the fit check all show one
    // number.
    const lineWidth = (i: number) => r.lineWidthsMm?.[i] ?? r.widthMm;

    // The border is a stroke painted under the fill, so the letters keep
    // their shape and grow outward by exactly the millimetres chosen.
    const border = r.borderMm > 0 ? ` stroke="${escapeXml(color)}" stroke-width="${(2 * r.borderMm).toFixed(2)}" stroke-linejoin="round" paint-order="stroke"` : '';
    // Letter spacing, as the editor applies it: a share of the cap height per gap.
    const tracking = (r.trackingPct || 0) * r.heightMm;

    // The arc a curved line rides. The radius comes from the chord the
    // straight version would have occupied, so bending a word does not also
    // resize it.
    const arc = (i: number) => {
      const chord = Math.max(1, lineWidth(i));
      const half = (Math.abs(r.curveDeg) * Math.PI) / 360;
      const radius = chord / (2 * Math.sin(half));
      const y = firstY + i * lead;
      const dy = r.curveDeg > 0 ? radius - radius * Math.cos(half) : -(radius - radius * Math.cos(half));
      return { chord, half, radius, y: round1(y + dy) };
    };

    // ── Outlines: the face itself, from its own file ─────────────────────
    const font = this.glyphs?.font(r.fontKey, r.fontWeight) ?? null;
    if (font) {
      return lines.map((line, i) => {
        const y = round1(firstY + i * lead);
        const target = lineWidth(i) - 2 * r.borderMm;
        if (!r.curveDeg) {
          const { d, advance } = this.glyphs!.line(font, line, fontSizeMm, tracking);
          // Scaled to the measured width, exactly as the editor forces it.
          const sx = advance > 0 && target > 0 ? target / advance : 1;
          return `<path d="${d}" transform="translate(0 ${y}) scale(${sx.toFixed(4)} 1)" fill="${escapeXml(color)}"${border}/>`;
        }
        // Along the arc, glyph by glyph: each letter sits at its share of the
        // run and turns to the tangent there, the run centred on the crown.
        const { half, radius, y: ay } = arc(i);
        const glyphs = this.glyphs!.glyphs(font, line, fontSizeMm, tracking);
        const natural = glyphs.reduce((n, g) => n + g.advance, 0);
        const run = Math.max(1, target);
        const sx = natural > 0 ? run / natural : 1;
        const up = r.curveDeg > 0;
        // The circle's centre sits below an arch and above a bowl, so that
        // the arc's crown lands on the line's own y.
        const cyCircle = up ? ay + radius * Math.cos(half) : ay - radius * Math.cos(half);
        let along = -run / 2;
        return glyphs
          .map((g) => {
            const mid = along + (g.advance * sx) / 2;
            along += g.advance * sx;
            const theta = mid / radius; // radians from the crown, left negative
            const gx = radius * Math.sin(theta);
            const gy = up ? cyCircle - radius * Math.cos(theta) : cyCircle + radius * Math.cos(theta);
            const rot = ((up ? theta : -theta) * 180) / Math.PI;
            return `<path d="${g.d}" transform="translate(${round1(gx)} ${round1(gy)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(4)} 1)" fill="${escapeXml(color)}"${border}/>`;
          })
          .join('');
      });
    }

    // ── No file for this face: `<text>`, in whatever the renderer has ───
    const attrs =
      `font-family="${escapeXml(r.fontName)}" font-size="${fontSizeMm.toFixed(2)}" ` +
      `font-weight="${r.fontWeight}" text-anchor="middle" dominant-baseline="central"${border}`;
    return lines.map((line, i) => {
      const y = round1(firstY + i * lead);
      const lengthAttrs = lineWidth(i) > 0 ? ` textLength="${round1(lineWidth(i))}" lengthAdjust="spacingAndGlyphs"` : '';
      if (!r.curveDeg) {
        return `<text x="0" y="${y}" ${attrs}${lengthAttrs} fill="${escapeXml(color)}">${escapeXml(line)}</text>`;
      }
      const { chord, radius, y: ay } = arc(i);
      const sweep = r.curveDeg > 0 ? 1 : 0;
      const pathId = `${idPrefix}-arc-${i}`;
      const d = `M ${round1(-chord / 2)} ${ay} A ${round1(radius)} ${round1(radius)} 0 0 ${sweep} ${round1(chord / 2)} ${ay}`;
      return (
        `<path id="${pathId}" d="${d}" fill="none"/>` +
        `<text ${attrs} fill="${escapeXml(color)}">` +
        `<textPath href="#${pathId}" startOffset="50%"${lengthAttrs}>${escapeXml(line)}</textPath>` +
        `</text>`
      );
    });
  }

  buildProductionSvg(r: ResolvedPersonalization, placement: { fieldWidthMm: number; fieldHeightMm: number }): string {
    const w = placement.fieldWidthMm;
    const h = placement.fieldHeightMm;

    // The hoop was fitted round wherever the customer put the boxes, so the
    // sheet has to show two things: where the position was traced, and where
    // this job is actually hooped. The operator hoops on the second.
    const dx = r.offsetXMm;
    const dy = r.offsetYMm;
    const moved = dx !== 0 || dy !== 0;

    // The page has to hold the reference rectangle AND the job's own, which may
    // be offset — plus every box, which may be turned and sit near an edge.
    // A rotated box's footprint is wider than its sides, so the corners are
    // measured rather than guessed; without this an angled box is simply
    // cropped off a printed sheet.
    const points: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, h / 2],
      [dx - w / 2, dy - h / 2],
      [dx + w / 2, dy + h / 2],
    ];
    for (const el of r.elements) {
      const rad = (el.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const bw = Math.max(el.widthMm, 1) / 2;
      const bh = Math.max(el.stackMm, el.heightMm) / 2;
      for (const [x, y] of [
        [-bw, -bh],
        [bw, -bh],
        [bw, bh],
        [-bw, bh],
      ]) {
        points.push([dx + el.offsetXMm + x * cos - y * sin, dy + el.offsetYMm + x * sin + y * cos]);
      }
    }

    const MARGIN = 4;
    const minX = Math.min(...points.map((p) => p[0])) - MARGIN;
    const maxX = Math.max(...points.map((p) => p[0])) + MARGIN;
    const minY = Math.min(...points.map((p) => p[1])) - MARGIN;
    const maxY = Math.max(...points.map((p) => p[1])) + MARGIN;

    const pageW = round1(maxX - minX);
    const pageH = round1(maxY - minY);
    // Where the traced centre lands on the page, once everything is in frame.
    const cx0 = round1(-minX);
    const cy0 = round1(-minY);
    const originX = round1(cx0 - w / 2);
    const originY = round1(cy0 - h / 2);

    const offsetNote = moved ? ` · hooped ${dx}mm, ${dy}mm from the traced centre` : ' · centred on the traced position';
    // Every setting that changes what the machine does has to reach the sheet,
    // or the operator produces something the customer did not buy. One line
    // per box, because each is its own words, face, spool and place.
    const boxNotes = r.elements.map((el, i) => {
      const extras = [
        el.fontWeight !== 400 ? `weight ${el.fontWeight}` : null,
        el.lineCount > 1 ? `${el.lineCount} lines` : null,
        el.curveDeg ? `curved ${el.curveDeg}°` : null,
        el.trackingPct ? `tracking ${el.trackingPct > 0 ? '+' : ''}${Math.round(el.trackingPct * 100)}%` : null,
        el.kerning?.some((k) => k !== 0) ? 'kerned' : null,
        el.isPuff ? '3D PUFF — foam under satin' : null,
        el.borderMm > 0 ? `satin border ${el.borderMm}mm round the letters` : null,
        // "FULL COLOUR" follows `ownColours`, not the presence of shapes: a
        // one-spool design has shapes too, and telling the operator to load
        // four cones for it would have them re-thread the machine for nothing.
        el.motif
          ? `motif "${el.motif.name}" at ${el.motif.sizeMm}×${el.motif.heightMm}mm${
              el.motif.ownColours && el.motif.paths?.length ? ` — FULL COLOUR, ${[...new Set(el.motif.paths.map((p) => p.fill))].join(' ')}` : ''
            }`
          : null,
        el.artwork ? `CUSTOMER ARTWORK "${el.artwork.name}" ${el.artwork.widthMm}×${el.artwork.heightMm}mm — digitise from the original file` : null,
        el.thread?.finish && el.thread.finish !== 'matte' ? `finish: ${el.thread.finish}` : null,
        el.offsetXMm || el.offsetYMm ? `at ${el.offsetXMm}mm, ${el.offsetYMm}mm from the hoop's centre` : 'centred in the hoop',
        el.rotationDeg ? `turned ${el.rotationDeg}°` : null,
      ].filter(Boolean);
      const subject = el.artwork ? `logo "${el.artwork.name}"` : el.motif ? el.motif.name : `"${el.text.replace(/\n/g, ' / ')}"`;
      const spool = el.thread ? `${el.thread.brand} ${el.thread.code} ${el.thread.name}` : 'own colours';
      const face = el.artwork ? `${el.artwork.widthMm}×${el.artwork.heightMm}mm` : `${el.fontName} ${el.heightMm}mm`;
      return `box ${i + 1}: ${subject} · ${face} · ${spool} · ${extras.join(' · ')}`;
    });

    const boxes = r.elements.flatMap((el, i) => [
      // Each box is placed and turned by one transform, so its lettering and
      // its own frame can never disagree about where it is.
      `<g transform="translate(${round1(el.offsetXMm)} ${round1(el.offsetYMm)}) rotate(${el.rotationDeg})">`,
      // Cap height is the em-square's cap, not its full body; 0.72 is the
      // usual ratio and keeps the rendered text at the millimetre height quoted.
      ...this.artworkBody(el, el.heightMm / 0.72, el.thread?.hex ?? '#111111', `b${i}`),
      `</g>`,
    ]);

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">`,
      `<title>${escapeXml(r.placementLabel)} — ${escapeXml(r.text || r.motif?.name || '')}</title>`,
      `<desc>${escapeXml(`${r.elements.length} ${r.elements.length === 1 ? 'box' : 'boxes'}${offsetNote}\n${boxNotes.join('\n')}`)}</desc>`,
      // Where the position was traced — faint, square to the page, for reference.
      `<rect x="${originX}" y="${originY}" width="${w}" height="${h}" fill="none" stroke="#e4e8ed" stroke-width="0.25" stroke-dasharray="1 2"/>`,
      `<path d="M${cx0} ${originY} V${originY + h} M${originX} ${cy0} H${originX + w}" stroke="#e4e8ed" stroke-width="0.2" stroke-dasharray="1 3"/>`,
      // Where this job is hooped. Solid where the reference is dotted, so the
      // two are never confused on a printed sheet.
      `<g transform="translate(${round1(cx0 + dx)} ${round1(cy0 + dy)})">`,
      `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="none" stroke="#c0c6cf" stroke-width="0.4" stroke-dasharray="2 2"/>`,
      `<path d="M0 ${-h / 2} v${h} M${-w / 2} 0 h${w}" stroke="#dfe4ea" stroke-width="0.2" stroke-dasharray="1 3"/>`,
      ...boxes,
      `</g>`,
      `</svg>`,
    ].join('\n');
  }

  /** A stored design row, resolved far enough to be drawn. */
  /**
   * The positions' names in one language, for lines whose frozen
   * `placementLabel` was written in whatever language the basket was in at
   * the time. A customer who switches language — or opens the confirmation
   * from an email in another — should read "Face 1", not "Side 1". Keyed
   * `productId:placementKey`; a position since deleted is simply absent, and
   * the caller keeps the frozen label.
   */
  async placementLabels(refs: { productId: string | null; placementKey: string }[], lang?: string): Promise<Map<string, string>> {
    const productIds = [...new Set(refs.map((r) => r.productId).filter((id): id is string => !!id))];
    if (!productIds.length) return new Map();
    const rows = await this.prisma.personalizationPlacement.findMany({
      where: { productId: { in: productIds }, key: { in: [...new Set(refs.map((r) => r.placementKey))] } },
      select: { productId: true, key: true, label: true },
    });
    return new Map(rows.map((p) => [`${p.productId}:${p.key}`, pickLocalized(p.label, lang)]));
  }

  resolvedFromRow(row: CartLineDesign): ResolvedPersonalization {
    return rowToResolved(row);
  }

  /**
   * The design as the customer saw it: drawn over their own photograph, in
   * that photograph's pixels.
   *
   * The panel they (or the item type) framed on the photo, with its real
   * size, is the scale — exactly the conversion the editor's preview used —
   * so what comes out is the picture they placed the boxes on, and the desk
   * can hold it next to the item.
   */
  mockupOverlaySvg(
    r: ResolvedPersonalization,
    frame: { widthPx: number; heightPx: number; panel: { x: number; y: number }[]; panelWidthMm: number },
    /** Customer artwork renderings, base64 PNG by storage key — fetched by the caller, drawn here. */
    images?: Map<string, string>,
  ): string {
    const xs = frame.panel.map((p) => p.x);
    const ys = frame.panel.map((p) => p.y);
    const panelLeft = (Math.min(...xs) / 100) * frame.widthPx;
    const panelRight = (Math.max(...xs) / 100) * frame.widthPx;
    const panelTop = (Math.min(...ys) / 100) * frame.heightPx;
    const panelBottom = (Math.max(...ys) / 100) * frame.heightPx;
    const pxPerMm = Math.max(0.01, (panelRight - panelLeft) / Math.max(1, frame.panelWidthMm));
    const cx = (panelLeft + panelRight) / 2 + r.offsetXMm * pxPerMm;
    const cy = (panelTop + panelBottom) / 2 + r.offsetYMm * pxPerMm;

    const boxes = r.elements.flatMap((el, i) => [
      `<g transform="translate(${round1(el.offsetXMm)} ${round1(el.offsetYMm)}) rotate(${el.rotationDeg})">`,
      ...this.artworkBody(el, el.heightMm / 0.72, el.thread?.hex ?? '#111111', `m${i}`, images),
      `</g>`,
    ]);

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.widthPx}" height="${frame.heightPx}" viewBox="0 0 ${frame.widthPx} ${frame.heightPx}">`,
      // Millimetres inside, pixels outside: one scale on the group is what
      // keeps every box at the size the customer set.
      `<g transform="translate(${round1(cx)} ${round1(cy)}) scale(${pxPerMm.toFixed(4)})">`,
      ...boxes,
      `</g>`,
      `</svg>`,
    ].join('\n');
  }

  /**
   * Renders production artwork for every personalised line of a basket, keyed
   * by cart item id.
   *
   * Best-effort by design: a line whose artwork could not be rendered still
   * becomes an order, because `designJson` on the row carries everything
   * needed to regenerate it later. Losing a sale to a rendering failure would
   * be a far worse outcome than an operator pressing "regenerate".
   */
  async buildArtworkForCartItems(
    items: { id: string; personalizations: CartLineDesign[] }[],
  ): Promise<Map<string, string>> {
    // Keyed by cart item AND position, because one line can now carry a design
    // on the front panel and another on the back strap, and each is its own
    // sheet on the floor.
    const svgs = new Map<string, string>();
    for (const item of items) {
      for (const design of item.personalizations ?? []) {
        try {
          // The field comes off the design, not off the position it was made
          // against: a shop that resizes a position tomorrow must not change
          // the sheet for a job it sold today.
          svgs.set(
            `${item.id}:${design.placementKey}`,
            this.buildProductionSvg(rowToResolved(design), {
              fieldWidthMm: design.fieldWidthMm,
              fieldHeightMm: design.fieldHeightMm,
            }),
          );
        } catch (err) {
          this.logger.warn(
            `Production artwork failed for cart item ${item.id} (${design.placementKey}): ${(err as Error).message}`,
          );
        }
      }
    }
    return svgs;
  }

}

/**
 * A stored design row as the artwork renderer wants it.
 *
 * The two shapes have drifted apart on purpose: the row is flat columns a
 * database can index, while the renderer wants the derived things — the lines
 * split out, the motif gathered up, the outline thread parsed back from JSON.
 * Casting one to the other used to work when they were the same seven fields;
 * once they were not, every sheet silently came back empty, because the render
 * threw on `lines.length` and the catch swallowed it.
 */
function rowToResolved(row: CartLineDesign): ResolvedPersonalization {
  const threads = (row.threadColors as ResolvedThread[]) ?? [];
  const motif = row.motifKey
    ? {
        key: row.motifKey,
        name: row.motifName ?? row.motifKey,
        path: row.motifPath ?? '',
        viewBox: row.motifViewBox ?? '0 0 100 100',
        sizeMm: row.motifSizeMm ?? 30,
        heightMm: row.motifSizeMm ?? 30,
        // Nothing re-prices a stored design; this is read back, never charged.
        priceCents: 0,
        colorCount: 1,
        // The row's flat motif columns are a silhouette by construction: they
        // predate shapes entirely, so there are no fills of its own to use.
        paths: null,
        ownColours: false,
      }
    : null;
  const widthMm = widthFromRow(row);

  return {
    ...(row as unknown as ResolvedPersonalization),
    lines: row.text ? String(row.text).split('\n') : [],
    outlineThread: (row.outlineThread as ResolvedThread | null) ?? null,
    threadColors: threads,
    motif,
    kerning: (row.kerning as number[] | null) ?? null,
    // Derived at resolve time and never given a column of its own, so it comes
    // back out of the frozen design document. Without it the arc's radius is a
    // division by undefined and every curved sheet renders as `M NaN NaN`.
    widthMm,
    elements: elementsFromRow(row, threads, motif, widthMm),
  };
}

/**
 * The boxes of a stored design.
 *
 * A version-2 document carries them in full. A row written before boxes
 * existed is one box: its columns are that box, and it sat at the area's
 * centre turned by the row's own angle — which is what the old sheet drew.
 */
export function elementsFromRow(
  row: CartLineDesign,
  threads: ResolvedThread[],
  motif: ResolvedMotif | null,
  widthMm: number,
): ResolvedElement[] {
  const doc = row.designJson as { version?: number; elements?: StoredElement[] } | null;
  if (doc?.version === 2 && Array.isArray(doc.elements) && doc.elements.length) {
    return doc.elements.map((el) => ({
      contentType: el.contentType,
      text: el.text ?? '',
      lines: el.lines ?? (el.text ? el.text.split('\n') : []),
      lineCount: (el.lines ?? []).length,
      fontKey: el.font?.key ?? row.fontName,
      fontName: el.font?.name ?? row.fontName,
      heightMm: el.heightMm,
      weightStep: el.weightStep ?? DEFAULT_WEIGHT_STEP,
      fontWeight: el.fontWeight ?? 400,
      trackingPct: el.trackingPct ?? 0,
      kerning: el.kerning ?? null,
      curveDeg: el.curveDeg ?? 0,
      isPuff: !!el.isPuff,
      motif: el.motif
        ? {
            key: el.motif.key,
            name: el.motif.name,
            sizeMm: el.motif.sizeMm,
            heightMm: el.motif.heightMm ?? el.motif.sizeMm,
            // Older v2 documents carried no path; the row's own motif columns
            // hold the first one, which is the best that can be done for them.
            path: el.motif.path ?? (motif?.key === el.motif.key ? motif.path : ''),
            viewBox: el.motif.viewBox ?? motif?.viewBox ?? '0 0 100 100',
            paths: el.motif.paths ?? null,
            // Documents written before the flag existed encoded the same
            // decision in the presence of shapes, so that is what they still
            // mean — a job on the floor must not change colour under it.
            ownColours: el.motif.ownColours ?? !!el.motif.paths?.length,
            // Frozen with the document, so a receipt or a sheet can show what
            // the design added. Never re-charged.
            priceCents: el.motif.priceCents ?? 0,
            colorCount: 1,
          }
        : null,
      artwork: (el.artwork as ResolvedArtwork | undefined) ?? null,
      borderMm: el.borderMm ?? 0,
      leading: el.leading ?? DEFAULT_LEADING,
      thread:
        (el.thread as ResolvedThread | null | undefined) ??
        (el.contentType === 'artwork' || (el.motif?.ownColours ?? !!el.motif?.paths?.length) ? null : (threads[0] ?? null)),
      widthMm: el.widthMm ?? 0,
      lineWidthsMm: el.lineWidthsMm ?? [],
      stackMm: el.stackMm ?? el.heightMm,
      offsetXMm: el.offsetXMm ?? 0,
      offsetYMm: el.offsetYMm ?? 0,
      rotationDeg: el.rotationDeg ?? 0,
    }));
  }
  const lines = row.text ? String(row.text).split('\n') : [];
  return [
    {
      contentType: row.contentType,
      text: row.text,
      lines,
      lineCount: lines.length,
      fontKey: row.fontName,
      fontName: row.fontName,
      heightMm: row.heightMm,
      weightStep: DEFAULT_WEIGHT_STEP,
      fontWeight: row.fontWeight,
      trackingPct: row.trackingPct,
      kerning: (row.kerning as number[] | null) ?? null,
      curveDeg: row.curveDeg,
      isPuff: row.isPuff,
      motif,
      artwork: null,
      borderMm: 0,
      leading: DEFAULT_LEADING,
      thread: threads[0] ?? { id: '', brand: '', code: '', name: '', hex: '#000000', finish: 'matte', priceMultiplier: 1 },
      widthMm,
      lineWidthsMm: [],
      stackMm: row.heightMm,
      offsetXMm: 0,
      offsetYMm: 0,
      rotationDeg: row.rotationDeg,
    },
  ];
}

/**
 * The clearance a frame needs round the stitching, each side. Underlay and
 * the frame's own bite both need fabric that carries no thread.
 */
const HOOP_MARGIN_MM = 4;

/**
 * The smallest rectangle, square to the garment, that holds every box with
 * its clearance — measured on each box's real footprint, turned as it is.
 * Centred on the boxes, so a design nudged to one side is hooped there rather
 * than in a frame twice the size.
 */
export function hoopAround(elements: { offsetXMm: number; offsetYMm: number; rotationDeg: number; widthMm: number; stackMm: number; heightMm: number }[]): {
  widthMm: number;
  heightMm: number;
  cxMm: number;
  cyMm: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const rad = (el.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const bw = Math.max(el.widthMm, 1) / 2;
    const bh = Math.max(el.stackMm, el.heightMm, 1) / 2;
    for (const [x, y] of [
      [-bw, -bh],
      [bw, -bh],
      [bw, bh],
      [-bw, bh],
    ]) {
      const px = el.offsetXMm + x * cos - y * sin;
      const py = el.offsetYMm + x * sin + y * cos;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
  }
  return {
    widthMm: round1(Math.max(FIELD_MIN_MM, maxX - minX + 2 * HOOP_MARGIN_MM)),
    heightMm: round1(Math.max(FIELD_MIN_MM, maxY - minY + 2 * HOOP_MARGIN_MM)),
    cxMm: round1((minX + maxX) / 2),
    cyMm: round1((minY + maxY) / 2),
  };
}

/** A box as the version-2 design document stores it. */
interface StoredElement {
  contentType: ContentType;
  text?: string;
  lines?: string[];
  font?: { key: string; name: string };
  heightMm: number;
  weightStep?: number;
  fontWeight?: number;
  trackingPct?: number;
  kerning?: number[] | null;
  curveDeg?: number;
  isPuff?: boolean;
  motif?: {
    key: string; name: string; sizeMm: number; heightMm?: number; path?: string; viewBox?: string;
    paths?: MotifPath[] | null; ownColours?: boolean; priceCents?: number;
  } | null;
  artwork?: ResolvedArtwork | null;
  borderMm?: number;
  leading?: number;
  lineWidthsMm?: number[];
  widthMm?: number;
  stackMm?: number;
  offsetXMm?: number;
  offsetYMm?: number;
  rotationDeg?: number;
  thread?: { brand: string; code: string; name: string; hex: string } | null;
}

/** The design's measured width, from the document it was frozen into. */
function widthFromRow(row: CartLineDesign): number {
  const doc = row.designJson as { widthMm?: unknown } | null;
  const stored = typeof doc?.widthMm === 'number' && Number.isFinite(doc.widthMm) ? doc.widthMm : 0;
  if (stored > 0) return stored;
  // A row written before the document carried it: fall back to the field, which
  // renders a flatter arc than intended but never a broken one.
  return row.fieldWidthMm || 100;
}

/**
 * JSON with object keys in sorted order at every depth, so the hash depends on
 * the design and not on the order the fields happened to be built in.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** One decimal place — the resolution a machine is set to, and what the hash sees. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Two places for the spacing controls, which work in fractions of a height. */
/**
 * How big the customer's photograph is, in the millimetres the panel gives
 * it: the panel's real size scaled up by the share of the picture it
 * covers. A cap photographed close, with the front taking half the frame,
 * is about twice the panel wide.
 */
function photoExtentMm(corners: { x: number; y: number }[], panel: { fieldWidthMm: number; fieldHeightMm: number }): { maxWidthMm: number; maxHeightMm: number } {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const wShare = Math.max(1, Math.max(...xs) - Math.min(...xs)) / 100;
  const hShare = Math.max(1, Math.max(...ys) - Math.min(...ys)) / 100;
  return { maxWidthMm: round1(panel.fieldWidthMm / wShare), maxHeightMm: round1(panel.fieldHeightMm / hShare) };
}

/** The stored shapes of a full-colour design, or null for a silhouette — never trusting the JSON's shape. */
function motifPaths(raw: unknown): MotifPath[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((p): p is { d: unknown; fill: unknown; transform?: unknown } => !!p && typeof p === 'object')
    .filter((p) => typeof p.d === 'string' && typeof p.fill === 'string')
    .map((p) => ({
      d: p.d as string,
      fill: p.fill as string,
      // Re-checked on the way out, not just at ingest: a row written before the
      // check existed, or edited straight in the database, still reaches an SVG
      // attribute from here.
      ...(typeof p.transform === 'string' && SAFE_TRANSFORM.test(p.transform.trim()) ? { transform: p.transform.trim() } : {}),
    }));
  return out.length ? out : null;
}

/** Same grammar `svg-artwork.ts` accepts: transform functions and numbers, nothing else. */
const SAFE_TRANSFORM = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+0-9eE.,\s]+\)\s*)+$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Folds any angle into (-180, 180]. */
function normalizeAngle(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > ROTATION_LIMIT_DEG ? wrapped - 360 : wrapped;
}

function clamp(n: number, min: number, max: number): number {
  // A field narrower than the design gives min > max; the design is already
  // rejected as too wide by then, but returning 0 keeps this total.
  if (min > max) return 0;
  return Math.min(max, Math.max(min, n));
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}
