import { Injectable, Logger } from '@nestjs/common';
import sharp = require('sharp');
import { PrismaService } from '../prisma/prisma.service';
import { GcsService } from '../gcs/gcs.service';
import { PersonalizationService } from './personalization.service';

/** Where the basket pictures live — private, signed on read, like the photos they are drawn on. */
export const DESIGN_PREVIEW_PREFIX = 'design-previews/';
/** Long side of a basket picture: a thumbnail and a checkout card, never a print. */
const PREVIEW_MAX_PX = 900;

interface Corner {
  x: number;
  y: number;
}

/**
 * The picture of a design as the customer placed it — their words on the
 * position's photograph, or on their own — drawn once when the line goes
 * into the basket and shown wherever the line is shown after that: the
 * drawer, the checkout summary, the confirmation, the tracking page.
 *
 * Best-effort by design: a basket line whose picture could not be drawn is
 * still a basket line, and falls back to the product photo. The same
 * composite the send-in desk works from (`mockupOverlaySvg`), at a size fit
 * for a card.
 */
@Injectable()
export class DesignPreviewService {
  private readonly logger = new Logger(DesignPreviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly personalization: PersonalizationService,
  ) {}

  /** Draws and stores a picture for every design on the basket line. */
  async renderForCartItem(cartItemId: string): Promise<void> {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { personalizations: true },
    });
    if (!item?.personalizations.length) return;

    const placements = await this.prisma.personalizationPlacement.findMany({
      where: { productId: item.productId, key: { in: item.personalizations.map((d) => d.placementKey) } },
    });

    for (const row of item.personalizations) {
      if (row.previewKey) continue;
      try {
        const design = this.personalization.resolvedFromRow(row);
        const doc = row.designJson as { customerItem?: { photoKeys?: string[]; corners?: Corner[]; panelWidthMm?: number } | null } | null;
        const placement = placements.find((p) => p.key === row.placementKey);

        // The photo and the traced panel: the customer's own on a send-in,
        // the position's on a catalogue product.
        let photoKey: string | null = null;
        let corners: Corner[] | null = null;
        let panelWidthMm = 0;
        if (doc?.customerItem?.photoKeys?.[0] && doc.customerItem.corners) {
          photoKey = doc.customerItem.photoKeys[0];
          corners = doc.customerItem.corners;
          panelWidthMm = doc.customerItem.panelWidthMm ?? row.fieldWidthMm;
        } else if (placement?.mediaKey) {
          photoKey = placement.mediaKey;
          // Untraced positions show a flat box in the editor; the same box
          // is where the design is drawn here.
          corners = placement.isTraced
            ? [
                { x: placement.topLeftXPct, y: placement.topLeftYPct },
                { x: placement.topRightXPct, y: placement.topRightYPct },
                { x: placement.bottomRightXPct, y: placement.bottomRightYPct },
                { x: placement.bottomLeftXPct, y: placement.bottomLeftYPct },
              ]
            : [
                { x: placement.previewXPct, y: placement.previewYPct },
                { x: placement.previewXPct + placement.previewWidthPct, y: placement.previewYPct },
                { x: placement.previewXPct + placement.previewWidthPct, y: placement.previewYPct + placement.previewHeightPct },
                { x: placement.previewXPct, y: placement.previewYPct + placement.previewHeightPct },
              ];
          panelWidthMm = placement.fieldWidthMm;
        }
        if (!photoKey || !corners) continue;

        const photo = await this.gcs.download(photoKey);
        const baseBuf = await sharp(photo).rotate().resize({ width: PREVIEW_MAX_PX, height: PREVIEW_MAX_PX, fit: 'inside', withoutEnlargement: true }).toBuffer();
        const base = sharp(baseBuf);
        const { width, height } = await base.metadata();
        if (!width || !height) continue;

        // The customer's own logos, so the picture shows the file rather than
        // a labelled frame.
        const images = new Map<string, string>();
        for (const el of design.elements) {
          if (el.artwork && !images.has(el.artwork.key)) {
            images.set(el.artwork.key, (await this.gcs.download(el.artwork.key)).toString('base64'));
          }
        }
        const overlay = this.personalization.mockupOverlaySvg(design, { widthPx: width, heightPx: height, panel: corners, panelWidthMm }, images);
        const png = await base.composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png({ compressionLevel: 8 }).toBuffer();
        const key = `${DESIGN_PREVIEW_PREFIX}${row.id}.png`;
        await this.gcs.upload(png, key, 'image/png', 'private');
        await this.prisma.cartItemPersonalization.update({ where: { id: row.id }, data: { previewKey: key } });
      } catch (err) {
        this.logger.warn(`Design preview for cart line ${cartItemId} / ${row.placementKey} not drawn: ${(err as Error).message}`);
      }
    }
  }
}
