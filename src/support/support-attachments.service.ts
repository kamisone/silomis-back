import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
// `import ... = require` like the other two callers: `allowSyntheticDefaultImports`
// is on but `esModuleInterop` is off, so a default import compiles to
// `sharp_1.default`, which is undefined for a CJS module whose export is the
// function itself.
import sharp = require('sharp');
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';

/** Where chat images live. Private — every read is a signed URL. */
const PREFIX = 'support-attachments/';

export const ATTACHMENT_MAX_FILES = 4;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * What a chat image is allowed to be, checked against the file's own first
 * bytes rather than its declared type or its extension — both of which are
 * whatever the uploader typed.
 *
 * Raster only. The send-in flow accepts SVG because it rasterises it
 * immediately; a chat must not, because an SVG is a script that an admin would
 * open inside an authenticated panel.
 */
const MAGIC: Array<{
  mime: string;
  ext: string;
  test: (b: Buffer) => boolean;
}> = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    // HEIC/HEIF — what an iPhone sends by default, so refusing it would refuse
    // most of the photographs customers actually take.
    mime: 'image/heic',
    ext: 'heic',
    test: (b) =>
      b.subarray(4, 8).toString('ascii') === 'ftyp' &&
      /hei[cx]|mif1|msf1/.test(b.subarray(8, 12).toString('ascii')),
  },
];

/** One image on a message, as stored. Keys only — URLs are signed on read. */
export interface StoredAttachment {
  key: string;
  thumbKey: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
}

/** The same, resolved for a client. */
export interface ResolvedAttachment extends StoredAttachment {
  url: string;
  thumbUrl: string;
}

/**
 * Images on an order conversation: validated, re-encoded and stored private.
 *
 * Nothing the uploader sends is trusted. The type comes from the file's own
 * magic bytes; the pixels are decoded and re-encoded rather than stored as
 * received, which drops EXIF — a customer's photograph of their cap carries
 * the GPS coordinates of their house — and turns anything that is not really
 * an image into a decode failure rather than a file on the shop's disk.
 */
@Injectable()
export class SupportAttachmentsService {
  private readonly logger = new Logger(SupportAttachmentsService.name);

  constructor(
    private readonly gcs: GcsService,
    private readonly assetUrls: AssetUrlService,
  ) {}

  async upload(files: Express.Multer.File[]): Promise<StoredAttachment[]> {
    if (files.length > ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(
        `At most ${ATTACHMENT_MAX_FILES} images per message.`,
      );
    }

    const out: StoredAttachment[] = [];
    for (const file of files) {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        throw new BadRequestException('An image may be at most 10MB.');
      }
      const kind = MAGIC.find((m) => m.test(file.buffer));
      if (!kind)
        throw new BadRequestException('Send a PNG, JPG, WebP or HEIC image.');

      const id = randomUUID();
      let full: { data: Buffer; info: { width: number; height: number } };
      let thumb: Buffer;

      // Decoding and storing are separate failures with separate causes: one
      // the shopper can fix, one only the shop can. Reporting a dead bucket as
      // "that image could not be read" sends a customer off to re-crop a
      // photograph that was never the problem.
      try {
        // `rotate()` with no argument applies the EXIF orientation before the
        // tag is dropped, so a phone photo does not come out sideways.
        const base = sharp(file.buffer, { failOn: 'error' }).rotate();

        full = await base
          .clone()
          // Bounded rather than resized: a 48-megapixel phone photo helps
          // nobody read a thread, and `withoutEnlargement` leaves a small
          // image alone.
          .resize({
            width: 2000,
            height: 2000,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });

        thumb = await base
          .clone()
          .resize({
            width: 480,
            height: 480,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 72, mozjpeg: true })
          .toBuffer();
      } catch (err) {
        this.logger.warn(
          `Rejected an attachment (${file.mimetype}, ${file.size}B): ${(err as Error).message}`,
        );
        throw new BadRequestException(
          'That image could not be read. Try another file.',
        );
      }

      const key = `${PREFIX}${id}.jpg`;
      const thumbKey = `${PREFIX}${id}-thumb.jpg`;
      // Deliberately uncaught: a storage failure is the shop's problem and a
      // 500 is the honest answer. Swallowing it would attach a message to a
      // picture that is not there.
      await Promise.all([
        this.gcs.upload(full.data, key, 'image/jpeg', 'private'),
        this.gcs.upload(thumb, thumbKey, 'image/jpeg', 'private'),
      ]);

      out.push({
        key,
        thumbKey,
        // Stored as JPEG whatever arrived: one output format means one thing
        // for a browser to render, and nothing left of the container the file
        // came in.
        mime: 'image/jpeg',
        bytes: full.data.length,
        width: full.info.width,
        height: full.info.height,
      });
    }
    return out;
  }

  /** Signs every attachment on a batch of messages, in one round trip. */
  async resolve(
    attachments: StoredAttachment[],
  ): Promise<ResolvedAttachment[]> {
    if (attachments.length === 0) return [];
    const keys = attachments.flatMap((a) => [a.key, a.thumbKey]);
    const urls = await this.assetUrls.resolveBatch(keys);
    return attachments.map((a) => ({
      ...a,
      url: urls.get(a.key) ?? '',
      thumbUrl: urls.get(a.thumbKey) ?? '',
    }));
  }
}
