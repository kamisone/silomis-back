import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { pickLocalized } from './localized.util';
import { PersonalizationInput } from './dto/personalization.dto';
import {
  BLOCKED_TEXT_PATTERNS,
  MONOGRAM_MAX_CHARS,
  MONOGRAM_MIN_CHARS,
  MAX_TRAVEL_FACTOR,
  MONOGRAM_STITCH_FACTOR,
  PERSONALIZATION_ERRORS as E,
  ROTATION_LIMIT_DEG,
  STITCHABLE_MONOGRAM,
  STITCHABLE_TEXT,
  STITCHES_PER_COLOR_CHANGE,
  STITCH_BASE_OVERHEAD,
  weightForStep,
} from './personalization.constants';

export interface ResolvedThread {
  id: string;
  brand: string;
  code: string;
  name: string;
  hex: string;
}

/**
 * A design that has passed every check, with everything the rest of the system
 * needs already derived. Nothing downstream re-reads the customer's input.
 */
export interface ResolvedPersonalization {
  templateId: string;
  placementKey: string;
  placementLabel: string;
  contentType: 'text' | 'monogram';
  /** Normalised — this exact string is what gets stitched. */
  text: string;
  fontKey: string;
  fontName: string;
  heightMm: number;
  /** 1–5 as chosen; `fontWeight` is the CSS/production value it maps to. */
  weightStep: number;
  fontWeight: number;
  threadColors: ResolvedThread[];
  stitchEstimate: number;
  /** Per unit. */
  priceCents: number;
  /** Predicted width of the stitched line, for the operator and the preview. */
  widthMm: number;
  /** Offset from the field's centre, in millimetres. Zero means centred. */
  offsetXMm: number;
  offsetYMm: number;
  /** Angle in the garment's plane. Zero means square to the traced position. */
  rotationDeg: number;
  designJson: Record<string, unknown>;
  /** Stable fingerprint — two cart lines with the same design share it. */
  hash: string;
}

/** A design as it is stored on a cart line — what the order paths hand back. */
export interface CartLineDesign {
  templateId: string;
  placementKey: string;
  placementLabel: string;
  contentType: 'text' | 'monogram';
  text: string;
  fontName: string;
  fontWeight: number;
  heightMm: number;
  threadColors: unknown;
  stitchEstimate: number;
  offsetXMm: number;
  offsetYMm: number;
  rotationDeg: number;
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

    const template = await this.prisma.personalizationTemplate.findUnique({
      where: { id: product.personalizationTemplateId },
      include: {
        placements: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        priceBands: { orderBy: { maxStitches: 'asc' } },
      },
    });
    if (!template || !template.isActive || !template.placements.length) return null;

    const [fonts, threads] = await Promise.all([
      this.prisma.embroideryFont.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.threadColor.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    if (!fonts.length || !threads.length) return null;

    const imageUrls = await this.assetUrls.resolveBatch(
      template.placements.map((p) => p.mediaKey).filter(Boolean) as string[],
    );

    // A position with no photograph has nothing for a customer to place artwork
    // on, so it is not offered at all — and a product whose every position is
    // in that state cannot be personalised yet.
    const offered = template.placements.filter((p) => p.mediaKey && imageUrls.get(p.mediaKey));
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
      placements: offered.map((p) => ({
        key: p.key,
        label: pickLocalized(p.label, lang),
        hint: pickLocalized(p.hint, lang) || null,
        fieldWidthMm: p.fieldWidthMm,
        fieldHeightMm: p.fieldHeightMm,
        maxColors: p.maxColors,
        maxChars: p.maxChars,
        priceCents: p.priceCents,
        imageUrl: imageUrls.get(p.mediaKey!)!,
        /** Null until an admin has traced it — the editor falls back to the flat box. */
        corners: p.isTraced
          ? [
              { x: p.topLeftXPct, y: p.topLeftYPct },
              { x: p.topRightXPct, y: p.topRightYPct },
              { x: p.bottomRightXPct, y: p.bottomRightYPct },
              { x: p.bottomLeftXPct, y: p.bottomLeftYPct },
            ]
          : null,
        preview: {
          xPct: p.previewXPct,
          yPct: p.previewYPct,
          widthPct: p.previewWidthPct,
          heightPct: p.previewHeightPct,
          rotateDeg: p.previewRotateDeg,
        },
      })),
      fonts: fonts.map((f) => ({
        key: f.key,
        name: f.name,
        webFamily: f.webFamily,
        minHeightMm: f.minHeightMm,
        maxHeightMm: f.maxHeightMm,
        avgCharWidthRatio: f.avgCharWidthRatio,
        // Sent so the editor can show a price that moves with the customer's
        // typing instead of a round trip per keystroke. Not a secret — it is a
        // density measurement, and the server re-derives the real figure
        // anyway before anything reaches a cart.
        stitchesPerCharAt10mm: f.stitchesPerCharAt10mm,
        uppercaseOnly: f.uppercaseOnly,
        supportsMonogram: f.supportsMonogram,
      })),
      threads: threads.map((t) => ({ id: t.id, brand: t.brand, code: t.code, name: t.name, hex: t.hex })),
      priceBands: template.priceBands.map((b) => ({ maxStitches: b.maxStitches, priceCents: b.priceCents, label: b.label })),
    };
  }

  // ── Validation, estimation and pricing ───────────────────────────────

  /**
   * The one path every design goes through, whether it arrived from the
   * editor's live quote or from add-to-cart. Throws a coded BadRequest on the
   * first rule it breaks; the storefront turns the code into translated copy.
   */
  async resolve(productId: string, input: PersonalizationInput, lang?: string): Promise<ResolvedPersonalization> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { personalizationTemplateId: true, status: true },
    });
    if (!product || product.status !== 'active' || !product.personalizationTemplateId) {
      fail(E.NOT_AVAILABLE, 'This product cannot be personalised.');
    }

    const template = await this.prisma.personalizationTemplate.findUnique({
      where: { id: product.personalizationTemplateId },
      include: {
        placements: { where: { isActive: true } },
        priceBands: { orderBy: { maxStitches: 'asc' } },
      },
    });
    if (!template?.isActive) fail(E.NOT_AVAILABLE, 'This product cannot be personalised.');

    if (input.contentType === 'text' && !template.allowText) {
      fail(E.CONTENT_TYPE_DISABLED, 'Text embroidery is not offered on this product.');
    }
    if (input.contentType === 'monogram' && !template.allowMonogram) {
      fail(E.CONTENT_TYPE_DISABLED, 'Monograms are not offered on this product.');
    }

    const placement = template.placements.find((p) => p.key === input.placementKey);
    if (!placement) fail(E.PLACEMENT_UNKNOWN, 'That embroidery position is not available.');

    // The same rule getConfigForProduct applies when deciding what to offer.
    // Enforced here too because the config is a convenience for the editor and
    // this is the only path into a cart — without it a crafted request could
    // buy a position with no artwork behind it, and the job would reach the
    // floor with nothing to show the operator.
    if (!placement.mediaKey) fail(E.PLACEMENT_UNKNOWN, 'That embroidery position is not set up yet.');

    const font = await this.prisma.embroideryFont.findUnique({ where: { key: input.fontKey } });
    if (!font?.isActive) fail(E.FONT_UNKNOWN, 'That embroidery font is not available.');
    if (input.contentType === 'monogram' && !font.supportsMonogram) {
      fail(E.FONT_UNKNOWN, 'That font cannot be used for a monogram.');
    }

    const text = this.normalizeText(input.text, input.contentType, font.uppercaseOnly);
    this.assertTextIsStitchable(text, input.contentType, placement.maxChars);

    // Threads are de-duplicated before counting: picking the same spool twice
    // is one colour on the machine, so charging two colour changes for it
    // would be wrong.
    const threads = await this.resolveThreads(input.threadColorIds);
    if (threads.length > placement.maxColors) {
      fail(E.TOO_MANY_COLORS, `This position takes at most ${placement.maxColors} thread colours.`, {
        maxColors: placement.maxColors,
      });
    }

    const heightMm = round1(input.heightMm);
    const maxHeightMm = Math.min(font.maxHeightMm, placement.fieldHeightMm);
    if (heightMm < font.minHeightMm || heightMm > maxHeightMm) {
      fail(E.HEIGHT_OUT_OF_RANGE, `Letter height must be between ${font.minHeightMm}mm and ${maxHeightMm}mm.`, {
        minHeightMm: font.minHeightMm,
        maxHeightMm,
      });
    }

    const weight = weightForStep(input.weight);
    const widthMm = this.estimateWidthMm(text, heightMm, font.avgCharWidthRatio, input.contentType) * weight.widthFactor;
    if (widthMm > placement.fieldWidthMm) {
      fail(E.TOO_WIDE, 'That is too wide for this position — shorten the text or reduce the height.', {
        widthMm: Math.round(widthMm),
        fieldWidthMm: placement.fieldWidthMm,
      });
    }

    // Where the customer moved it. The hoop field travels with the lettering —
    // outline and text together — so the field's own size is no longer the
    // bound; MAX_TRAVEL_FACTOR is. Clamped rather than rejected, because a drag
    // that ran past the limit should stop there, which is what the pointer was
    // already being shown; an error message for a gesture the editor visibly
    // constrained would be nonsense.
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

    const stitchEstimate = this.estimateStitches({
      text,
      heightMm,
      contentType: input.contentType,
      stitchesPerCharAt10mm: font.stitchesPerCharAt10mm,
      colorCount: threads.length,
      weightFactor: weight.stitchFactor,
    });

    const band = template.priceBands.find((b) => stitchEstimate <= b.maxStitches);
    if (!band) {
      // Past the largest band there is no price, and inventing one would mean
      // selling a job whose machine time nobody has costed.
      fail(E.TOO_MANY_STITCHES, 'That design is too large to embroider — try shorter text or a smaller height.', {
        stitchEstimate,
      });
    }

    // The stitch band covers machine time; the placement's own price covers the
    // hooping and the run. A customer embroidering two positions pays both
    // halves twice, because that is what the shop actually does twice.
    const placementLabel = pickLocalized(placement.label, lang);
    const priceCents = band.priceCents + placement.priceCents;

    const designJson = {
      version: 1 as const,
      templateKey: template.key,
      placementKey: placement.key,
      // The label travels with the design so a basket, an order confirmation
      // and a refund six months later all read the same words, even if the
      // shop has since renamed or deleted the position.
      placementLabel,
      contentType: input.contentType,
      text,
      font: { key: font.key, name: font.name },
      heightMm,
      weightStep: weight.step,
      fontWeight: weight.cssWeight,
      widthMm: round1(widthMm),
      offsetXMm,
      offsetYMm,
      rotationDeg,
      threads: threads.map((t) => ({ brand: t.brand, code: t.code, name: t.name, hex: t.hex })),
      stitchEstimate,
      priceCents,
    };

    return {
      templateId: template.id,
      placementKey: placement.key,
      placementLabel,
      contentType: input.contentType,
      text,
      fontKey: font.key,
      fontName: font.name,
      heightMm,
      weightStep: weight.step,
      fontWeight: weight.cssWeight,
      threadColors: threads,
      stitchEstimate,
      priceCents,
      widthMm: round1(widthMm),
      offsetXMm,
      offsetYMm,
      rotationDeg,
      designJson,
      hash: this.hashDesign(designJson),
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
  private normalizeText(raw: string, contentType: 'text' | 'monogram', uppercaseOnly: boolean): string {
    // NFC first — "é" typed as e + combining accent is two code points, which
    // would both overrun the character limit and reach the face as a glyph it
    // does not have.
    let text = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (contentType === 'monogram') text = text.replace(/\s/g, '').toUpperCase();
    else if (uppercaseOnly) text = text.toUpperCase();
    return text;
  }

  private assertTextIsStitchable(text: string, contentType: 'text' | 'monogram', maxChars: number): void {
    if (!text) fail(E.TEXT_EMPTY, 'Enter the text to embroider.');

    if (contentType === 'monogram') {
      if (text.length < MONOGRAM_MIN_CHARS || text.length > MONOGRAM_MAX_CHARS) {
        fail(E.MONOGRAM_LENGTH, `A monogram is ${MONOGRAM_MIN_CHARS} or ${MONOGRAM_MAX_CHARS} letters.`);
      }
      if (!STITCHABLE_MONOGRAM.test(text)) {
        fail(E.TEXT_UNSTITCHABLE, 'A monogram can only use letters.');
      }
    } else {
      if (text.length > maxChars) {
        fail(E.TEXT_TOO_LONG, `This position fits ${maxChars} characters.`, { maxChars });
      }
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
      return { id: r.id, brand: r.brand, code: r.code, name: r.name, hex: r.hex };
    });
  }

  // ── Estimation ───────────────────────────────────────────────────────

  /**
   * Predicted width of the stitched line. Deliberately an over-estimate: a
   * design that turns out narrower than predicted is a non-event, while one
   * that turns out wider does not fit the hoop and the order stops on the
   * floor. Spaces are counted at half an advance, which is what a face does.
   */
  private estimateWidthMm(text: string, heightMm: number, avgCharWidthRatio: number, contentType: 'text' | 'monogram'): number {
    const advances = [...text].reduce((sum, ch) => sum + (ch === ' ' ? 0.5 : 1), 0);
    const base = advances * heightMm * avgCharWidthRatio;
    // A monogram's letters interlock and the centre letter is drawn larger, so
    // it is wider than the same three characters set as text.
    return contentType === 'monogram' ? base * 1.25 : base;
  }

  /**
   * Stitch count, which is what the price is actually based on — machine time
   * is stitches, not characters.
   *
   * Glyph stitches scale with the square of the height because a letter grows
   * in both directions at once: doubling the height of a name roughly
   * quadruples the thread laid down, which is why a 25mm name costs several
   * times a 10mm one rather than 2.5x.
   */
  private estimateStitches(args: {
    text: string;
    heightMm: number;
    contentType: 'text' | 'monogram';
    stitchesPerCharAt10mm: number;
    colorCount: number;
    /** A heavier satin column is more thread over the same outline. */
    weightFactor: number;
  }): number {
    const glyphs = [...args.text].filter((ch) => ch !== ' ').length;
    const heightFactor = (args.heightMm / 10) ** 2;
    const typeFactor = args.contentType === 'monogram' ? MONOGRAM_STITCH_FACTOR : 1;

    const glyphStitches = glyphs * args.stitchesPerCharAt10mm * heightFactor * typeFactor * args.weightFactor;
    const colorStitches = Math.max(0, args.colorCount - 1) * STITCHES_PER_COLOR_CHANGE;

    return Math.ceil(glyphStitches + colorStitches + STITCH_BASE_OVERHEAD);
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
  buildProductionSvg(r: ResolvedPersonalization, placement: { fieldWidthMm: number; fieldHeightMm: number }): string {
    const w = placement.fieldWidthMm;
    const h = placement.fieldHeightMm;
    const color = r.threadColors[0]?.hex ?? '#000000';
    // Cap height is the em-square's cap, not its full body; 0.72 is the usual
    // ratio and keeps the rendered text at the millimetre height quoted.
    const fontSizeMm = r.heightMm / 0.72;

    // The customer moves the hoop field itself, not the lettering inside it, so
    // the sheet has to show two things: where the position was traced, and
    // where this job is actually stitched. The operator hoops on the second.
    const dx = r.offsetXMm;
    const dy = r.offsetYMm;
    const deg = r.rotationDeg;
    const moved = dx !== 0 || dy !== 0;

    // The page has to hold the reference rectangle AND the job's own, which may
    // be both offset and turned — a rotated rectangle's footprint is wider than
    // its sides, so the corners are measured rather than guessed. Without this
    // an angled design is simply cropped off a printed sheet.
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => [dx + x * cos - y * sin, dy + x * sin + y * cos]);

    const MARGIN = 4;
    const minX = Math.min(-w / 2, ...corners.map((c) => c[0])) - MARGIN;
    const maxX = Math.max(w / 2, ...corners.map((c) => c[0])) + MARGIN;
    const minY = Math.min(-h / 2, ...corners.map((c) => c[1])) - MARGIN;
    const maxY = Math.max(h / 2, ...corners.map((c) => c[1])) + MARGIN;

    const pageW = round1(maxX - minX);
    const pageH = round1(maxY - minY);
    // Where the traced centre lands on the page, once everything is in frame.
    const cx0 = round1(-minX);
    const cy0 = round1(-minY);
    const originX = round1(cx0 - w / 2);
    const originY = round1(cy0 - h / 2);

    const offsetNote = moved ? ` · hooped ${dx}mm, ${dy}mm from the traced centre` : ' · centred on the traced position';
    const rotationNote = deg !== 0 ? ` · turned ${deg}°` : '';
    const weightNote = r.fontWeight !== 400 ? ` · weight ${r.fontWeight}` : '';

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">`,
      `<title>${escapeXml(r.placementLabel)} — ${escapeXml(r.text)}</title>`,
      `<desc>${escapeXml(r.fontName)} · ${r.heightMm}mm${weightNote} · ${r.threadColors.map((t) => `${t.brand} ${t.code} ${t.name}`).join(', ')} · ~${r.stitchEstimate} stitches${offsetNote}${rotationNote}</desc>`,
      // Where the position was traced — faint, square to the page, for reference.
      `<rect x="${originX}" y="${originY}" width="${w}" height="${h}" fill="none" stroke="#e4e8ed" stroke-width="0.25" stroke-dasharray="1 2"/>`,
      `<path d="M${cx0} ${originY} V${originY + h} M${originX} ${cy0} H${originX + w}" stroke="#e4e8ed" stroke-width="0.2" stroke-dasharray="1 3"/>`,
      // Where this job is hooped, offset and turned. Solid where the reference
      // is dotted, so the two are never confused on a printed sheet. One
      // transform for the group means the lettering and its frame can never
      // disagree about the angle.
      `<g transform="translate(${round1(cx0 + dx)} ${round1(cy0 + dy)}) rotate(${deg})">`,
      `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="none" stroke="#c0c6cf" stroke-width="0.4" stroke-dasharray="2 2"/>`,
      `<path d="M0 ${-h / 2} v${h} M${-w / 2} 0 h${w}" stroke="#dfe4ea" stroke-width="0.2" stroke-dasharray="1 3"/>`,
      `<text x="0" y="0" font-family="${escapeXml(r.fontName)}" font-size="${fontSizeMm.toFixed(2)}" font-weight="${r.fontWeight}" fill="${escapeXml(color)}" text-anchor="middle" dominant-baseline="central">${escapeXml(r.text)}</text>`,
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
          const placement = await this.placementFor(design.templateId, design.placementKey);
          svgs.set(
            `${item.id}:${design.placementKey}`,
            this.buildProductionSvg(design as unknown as ResolvedPersonalization, {
              fieldWidthMm: placement.fieldWidthMm,
              fieldHeightMm: placement.fieldHeightMm,
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

  /** Re-reads the placement a resolved design refers to, for the SVG bounds. */
  async placementFor(templateId: string, placementKey: string) {
    const placement = await this.prisma.personalizationPlacement.findUnique({
      where: { templateId_key: { templateId, key: placementKey } },
    });
    if (!placement) throw new NotFoundException('Placement not found');
    return placement;
  }
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
