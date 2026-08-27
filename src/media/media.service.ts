import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MediaAsset,
  MediaFolder,
  MediaUsage,
} from '../../generated/prisma/client';

export interface MediaListOptions {
  search?: string;
  mimeType?: string;
  /** Broad type filter — translates to a mimeType prefix match */
  mediaType?: 'image' | 'video';
  tag?: string;
  folderId?: string | null; // undefined = all, null/string = filter by folder
  folderSet?: boolean; // true when folderId was explicitly provided (even as null)
  limit?: number;
  offset?: number;
}

export interface TrackUsageDto {
  entityType: string;
  entityId: string;
  field: string;
}

const MEDIA_PREFIX = 'media/';
/** Media object paths are content-addressed, so they can be cached indefinitely. */
const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];
const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/**
 * Ordinary image URLs end in a real filename (`.../product123.jpg`), but
 * some sources put arbitrary long text in the last path segment instead —
 * used verbatim that overflows originalFilename's varchar(500) and, worse,
 * gets read as a bogus multi-hundred-character "extension". Falls back to a
 * content-type-derived generic name whenever the last segment doesn't look
 * like a real `name.ext`.
 */
function deriveFilenameFromUrl(sourceUrl: string, contentType: string): string {
  const lastSegment = decodeURIComponent(
    sourceUrl.split('/').pop()?.split('?')[0] || '',
  );
  const looksLikeRealFilename =
    lastSegment.length > 0 &&
    lastSegment.length <= 200 &&
    /\.[a-z0-9]{2,5}$/i.test(lastSegment);
  if (looksLikeRealFilename) return lastSegment;
  return `image.${IMAGE_EXTENSION_BY_MIME[contentType] ?? 'bin'}`;
}

export type MediaKind = 'image' | 'video' | 'other';

/** Derives the broad media kind from a MIME type — used for filtering & UI display. */
export function getMediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly urls: AssetUrlService,
  ) {}

  // ── Upload ────────────────────────────────────────────────────────────

  async upload(
    file: Express.Multer.File,
    altText?: string,
    uploadedBy?: string,
    folderId?: string | null,
  ): Promise<MediaAsset & { url: string; mediaType: MediaKind }> {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }
    const kind = getMediaKind(file.mimetype);
    const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      throw new Error(`File too large (max ${maxBytes / 1024 / 1024} MB)`);
    }
    return this.persistBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      altText,
      uploadedBy,
      folderId,
    );
  }

  /**
   * Checksum → dedup → GCS upload → dimension extraction → MediaAsset insert.
   * Shared by upload() (multipart) and ingestFromUrl() (server-fetched bytes)
   * so both paths produce identical MediaAsset records.
   */
  private async persistBuffer(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    altText?: string,
    uploadedBy?: string,
    folderId?: string | null,
  ): Promise<MediaAsset & { url: string; mediaType: MediaKind }> {
    const kind = getMediaKind(mimeType);
    const checksum = crypto
      .createHash('sha256')
      .update(new Uint8Array(buffer))
      .digest('hex');

    // Dedup: return existing asset (move to requested folder if specified)
    const existing = await this.prisma.mediaAsset.findFirst({
      where: { checksum },
    });
    if (existing) {
      let updated = existing;
      if (folderId !== undefined && existing.folderId !== folderId) {
        updated = await this.prisma.mediaAsset.update({
          where: { id: existing.id },
          data: { folderId: folderId ?? null },
        });
      }
      const url = await this.urls.resolve(updated.storageKey);
      return { ...updated, url, mediaType: getMediaKind(updated.mimeType) };
    }

    const ext = originalFilename.split('.').pop()?.toLowerCase() ?? 'bin';
    const datePart = new Date().toISOString().slice(0, 7);
    const storageKey = `${MEDIA_PREFIX}${datePart}/${checksum.slice(0, 8)}-${Date.now()}.${ext}`;

    // storageKey embeds the content checksum and an upload timestamp, so an
    // object is immutable once written — different bytes get a different path.
    await this.gcs.upload(
      buffer,
      storageKey,
      mimeType,
      'publicRead',
      MEDIA_CACHE_CONTROL,
    );

    const { width, height, durationSeconds } =
      kind === 'video'
        ? await extractVideoMetadata(buffer, mimeType)
        : {
            ...(await extractImageDimensions(buffer, mimeType)),
            durationSeconds: null,
          };

    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey,
        originalFilename,
        mimeType,
        sizeBytes: buffer.byteLength,
        width,
        height,
        durationSeconds,
        altText: altText ?? null,
        checksum,
        uploadedBy: uploadedBy ?? null,
        folderId: folderId !== undefined ? (folderId ?? null) : null,
        tags: [],
        // Video transcoding (HLS/MP4 renditions) is not wired up yet in this
        // project — videos are served as the original upload.
        transcodeStatus: null,
      },
    });

    const url = await this.urls.resolve(storageKey);
    return { ...asset, url, mediaType: kind };
  }

  /**
   * Fetches an image from an arbitrary URL and persists it through the same
   * pipeline as a manual upload — used by server-side importers so ingested
   * images are indistinguishable from uploaded ones. Never throws for a
   * per-image failure — returns null so a batch of imports can degrade
   * gracefully instead of aborting as a unit.
   */
  async ingestFromUrl(
    sourceUrl: string,
    opts: {
      altText?: string;
      uploadedBy?: string;
      folderId?: string | null;
    } = {},
  ): Promise<(MediaAsset & { url: string; mediaType: MediaKind }) | null> {
    const shortUrl =
      sourceUrl.length > 150 ? `${sourceUrl.slice(0, 150)}…` : sourceUrl;
    try {
      const res = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.warn(
          `ingestFromUrl got HTTP ${res.status} for ${shortUrl}`,
        );
        return null;
      }
      const contentType =
        res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!ALLOWED_IMAGE_MIME_TYPES.includes(contentType)) {
        this.logger.warn(
          `ingestFromUrl got unsupported content-type "${contentType}" for ${shortUrl}`,
        );
        return null;
      }
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_IMAGE_BYTES) {
        this.logger.warn(
          `ingestFromUrl got ${arrayBuf.byteLength} bytes (outside allowed range) for ${shortUrl}`,
        );
        return null;
      }
      const buffer = Buffer.from(arrayBuf);
      const filename = deriveFilenameFromUrl(sourceUrl, contentType);
      return await this.persistBuffer(
        buffer,
        filename,
        contentType,
        opts.altText,
        opts.uploadedBy,
        opts.folderId,
      );
    } catch (err) {
      this.logger.warn(
        `ingestFromUrl failed for ${shortUrl}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ── List ──────────────────────────────────────────────────────────────

  async list(opts: MediaListOptions = {}): Promise<{
    items: Array<
      MediaAsset & { url: string; usageCount: number; mediaType: MediaKind }
    >;
    total: number;
  }> {
    const {
      search,
      mimeType,
      mediaType,
      tag,
      folderId,
      folderSet,
      limit = 48,
      offset = 0,
    } = opts;

    const where = {
      ...(search
        ? {
            originalFilename: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(mediaType ? { mimeType: { startsWith: `${mediaType}/` } } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(folderSet
        ? { folderId: folderId === null || folderId === '' ? null : folderId }
        : {}),
    };

    const [assets, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    const urlMap = await this.urls.resolveBatch(
      assets.map((a) => a.storageKey),
    );

    const ids = assets.map((a) => a.id);
    const usageCounts = ids.length
      ? await this.prisma.mediaUsage.groupBy({
          by: ['assetId'],
          where: { assetId: { in: ids } },
          _count: { id: true },
        })
      : [];
    const countMap = new Map(usageCounts.map((r) => [r.assetId, r._count.id]));

    return {
      items: assets.map((a) => ({
        ...a,
        url: urlMap.get(a.storageKey) ?? '',
        usageCount: countMap.get(a.id) ?? 0,
        mediaType: getMediaKind(a.mimeType),
      })),
      total,
    };
  }

  /** Batch-loads assets by storage key — used to enrich product media items (e.g. video duration/mimeType). */
  async findByStorageKeys(keys: string[]): Promise<MediaAsset[]> {
    if (!keys.length) return [];
    return this.prisma.mediaAsset.findMany({
      where: { storageKey: { in: [...new Set(keys)] } },
    });
  }

  // ── Single ────────────────────────────────────────────────────────────

  async findById(
    id: string,
  ): Promise<MediaAsset & { url: string; mediaType: MediaKind }> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media asset not found');
    const url = await this.urls.resolve(asset.storageKey);
    return { ...asset, url, mediaType: getMediaKind(asset.mimeType) };
  }

  // ── Update metadata ──────────────────────────────────────────────────

  async updateMetadata(
    id: string,
    dto: {
      altText?: string;
      title?: string;
      tags?: string[];
      folderId?: string | null;
    },
  ): Promise<MediaAsset & { url: string; mediaType: MediaKind }> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Media asset not found');

    const asset = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        altText: dto.altText !== undefined ? dto.altText : undefined,
        title: dto.title !== undefined ? (dto.title ?? null) : undefined,
        tags: dto.tags !== undefined ? dto.tags : undefined,
        folderId: 'folderId' in dto ? (dto.folderId ?? null) : undefined,
      },
    });

    const url = await this.urls.resolve(asset.storageKey);
    return { ...asset, url, mediaType: getMediaKind(asset.mimeType) };
  }

  // ── Bulk move ─────────────────────────────────────────────────────────

  async moveAssets(assetIds: string[], folderId: string | null): Promise<void> {
    if (!assetIds.length) return;
    await this.prisma.mediaAsset.updateMany({
      where: { id: { in: assetIds } },
      data: { folderId },
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media asset not found');

    const usageCount = await this.prisma.mediaUsage.count({
      where: { assetId: id },
    });
    if (usageCount > 0) {
      throw new ConflictException(
        `Asset is referenced by ${usageCount} usage record(s) and cannot be deleted. Remove all references first.`,
      );
    }

    await this.gcs.delete(asset.storageKey);
    await this.urls.invalidate(asset.storageKey);
    await this.prisma.mediaAsset.delete({ where: { id } });
  }

  // ── Folders ───────────────────────────────────────────────────────────

  async listFolders(): Promise<
    Array<MediaFolder & { assetCount: number; thumbnailUrl: string | null }>
  > {
    const folders = await this.prisma.mediaFolder.findMany({
      orderBy: { name: 'asc' },
    });
    if (!folders.length) return [];

    const counts = await this.prisma.mediaAsset.groupBy({
      by: ['folderId'],
      where: { folderId: { not: null } },
      _count: { id: true },
    });
    const countMap = new Map(
      counts.map((r) => [r.folderId as string, r._count.id]),
    );

    // Cover image per folder, so the grid is scannable without opening each
    // one — the most recently created image/poster in that folder.
    const thumbCandidates = await this.prisma.mediaAsset.findMany({
      where: {
        folderId: { not: null },
        OR: [
          { mimeType: { startsWith: 'image/' } },
          { autoPosterKey: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        folderId: true,
        mimeType: true,
        storageKey: true,
        autoPosterKey: true,
      },
    });
    const thumbKeyByFolder = new Map<string, string>();
    for (const c of thumbCandidates) {
      if (!c.folderId || thumbKeyByFolder.has(c.folderId)) continue;
      const key = c.mimeType.startsWith('image/')
        ? c.storageKey
        : c.autoPosterKey;
      if (key) thumbKeyByFolder.set(c.folderId, key);
    }
    const urlMap = await this.urls.resolveBatch([...thumbKeyByFolder.values()]);

    return folders.map((f) => {
      const key = thumbKeyByFolder.get(f.id);
      return {
        ...f,
        assetCount: countMap.get(f.id) ?? 0,
        thumbnailUrl: (key && urlMap.get(key)) || null,
      };
    });
  }

  async createFolder(
    name: string,
    parentId?: string | null,
  ): Promise<
    MediaFolder & { assetCount: number; thumbnailUrl: string | null }
  > {
    if (parentId) {
      const parent = await this.prisma.mediaFolder.findUnique({
        where: { id: parentId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
    }
    const folder = await this.prisma.mediaFolder.create({
      data: { name: name.trim(), parentId: parentId ?? null },
    });
    return { ...folder, assetCount: 0, thumbnailUrl: null };
  }

  /**
   * Re-parents a folder, refusing any move that would detach part of the tree
   * from the root.
   *
   * A folder dropped into its own descendant takes that whole branch with it
   * into a cycle: the pair would still exist in the table but would no longer
   * be reachable from any root, so it would vanish from the library with no way
   * to get it back. Cheaper to refuse the move than to write the repair tool.
   */
  async moveFolder(id: string, parentId: string | null): Promise<void> {
    const folder = await this.prisma.mediaFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException('Folder not found');
    if (parentId === id) {
      throw new BadRequestException('A folder cannot be moved into itself');
    }

    if (parentId) {
      const parent = await this.prisma.mediaFolder.findUnique({
        where: { id: parentId },
      });
      if (!parent) throw new NotFoundException('Target folder not found');

      // Walk up from the target: if this folder is on that path, the target is
      // one of its own descendants.
      const all = await this.prisma.mediaFolder.findMany({
        select: { id: true, parentId: true },
      });
      const parentOf = new Map(all.map((f) => [f.id, f.parentId]));
      const seen = new Set<string>();
      let cursor: string | null = parentId;
      while (cursor) {
        if (cursor === id) {
          throw new BadRequestException(
            'A folder cannot be moved into one of its own subfolders',
          );
        }
        // Defensive: a cycle already in the data must not spin here forever.
        if (seen.has(cursor)) break;
        seen.add(cursor);
        cursor = parentOf.get(cursor) ?? null;
      }
    }

    if (folder.parentId === parentId) return;
    await this.prisma.mediaFolder.update({ where: { id }, data: { parentId } });
  }

  async renameFolder(
    id: string,
    name: string,
  ): Promise<
    MediaFolder & { assetCount: number; thumbnailUrl: string | null }
  > {
    const existing = await this.prisma.mediaFolder.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Folder not found');
    await this.prisma.mediaFolder.update({
      where: { id },
      data: { name: name.trim() },
    });
    const all = await this.listFolders();
    return all.find((f) => f.id === id)!;
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = await this.prisma.mediaFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException('Folder not found');

    // Move direct assets and subfolders to the parent (or root) before deleting.
    await this.prisma.mediaAsset.updateMany({
      where: { folderId: id },
      data: { folderId: folder.parentId },
    });
    await this.prisma.mediaFolder.updateMany({
      where: { parentId: id },
      data: { parentId: folder.parentId },
    });

    await this.prisma.mediaFolder.delete({ where: { id } });
  }

  // ── Usage tracking ───────────────────────────────────────────────────

  async trackUsage(assetId: string, dto: TrackUsageDto): Promise<MediaUsage> {
    const existing = await this.prisma.mediaUsage.findFirst({
      where: {
        assetId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        field: dto.field,
      },
    });
    if (existing) return existing;
    return this.prisma.mediaUsage.create({ data: { assetId, ...dto } });
  }

  async removeUsage(
    assetId: string,
    entityType: string,
    entityId: string,
    field: string,
  ): Promise<void> {
    await this.prisma.mediaUsage.deleteMany({
      where: { assetId, entityType, entityId, field },
    });
  }

  async getUsage(assetId: string): Promise<MediaUsage[]> {
    return this.prisma.mediaUsage.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async syncEntityUsages(
    entityType: string,
    entityId: string,
    storageKeys: Array<{ key: string; field: string }>,
  ): Promise<void> {
    await this.prisma.mediaUsage.deleteMany({
      where: { entityType, entityId },
    });
    if (!storageKeys.length) return;

    const uniqueKeys = [...new Set(storageKeys.map((s) => s.key))];
    const assets = await this.prisma.mediaAsset.findMany({
      where: { storageKey: { in: uniqueKeys } },
    });
    const keyToId = new Map(assets.map((a) => [a.storageKey, a.id]));

    const records = storageKeys
      .filter(({ key }) => keyToId.has(key))
      .map(({ key, field }) => ({
        assetId: keyToId.get(key)!,
        entityType,
        entityId,
        field,
      }));

    if (records.length)
      await this.prisma.mediaUsage.createMany({ data: records });
  }
}

// ── Dimension extraction ────────────────────────────────────────────────

async function extractImageDimensions(
  buf: Buffer,
  mime: string,
): Promise<{ width: number | null; height: number | null }> {
  try {
    if (mime === 'image/png') {
      if (buf.length >= 24)
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    } else if (mime === 'image/jpeg') {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          marker === 0xc9 ||
          marker === 0xca
        ) {
          return {
            height: buf.readUInt16BE(i + 5),
            width: buf.readUInt16BE(i + 7),
          };
        }
        i += 2 + len;
      }
    } else if (mime === 'image/webp') {
      if (
        buf.length >= 30 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP'
      ) {
        const chunk = buf.toString('ascii', 12, 16);
        if (chunk === 'VP8 ' && buf.length >= 30) {
          return {
            width: (buf[26] | (buf[27] << 8)) & 0x3fff,
            height: (buf[28] | (buf[29] << 8)) & 0x3fff,
          };
        } else if (chunk === 'VP8L' && buf.length >= 25) {
          const bits = buf.readUInt32LE(21);
          return {
            width: (bits & 0x3fff) + 1,
            height: ((bits >> 14) & 0x3fff) + 1,
          };
        }
      }
    }
  } catch {
    /* Non-fatal */
  }
  return { width: null, height: null };
}

/** Locates a top-level MP4/ISO-BMFF box of the given type within [start, end), returning its content range (after the header). */
function findMp4Box(
  buf: Buffer,
  type: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const boxType = buf.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(buf.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    if (boxType === type)
      return { start: offset + headerSize, end: offset + size };
    offset += size;
  }
  return null;
}

async function extractVideoMetadata(
  buf: Buffer,
  mime: string,
): Promise<{
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}> {
  try {
    if (mime === 'video/mp4') {
      const moov = findMp4Box(buf, 'moov', 0, buf.length);
      const mvhd = moov && findMp4Box(buf, 'mvhd', moov.start, moov.end);
      if (mvhd) {
        const version = buf.readUInt8(mvhd.start);
        const timescale =
          version === 1
            ? buf.readUInt32BE(mvhd.start + 20)
            : buf.readUInt32BE(mvhd.start + 12);
        const duration =
          version === 1
            ? Number(buf.readBigUInt64BE(mvhd.start + 24))
            : buf.readUInt32BE(mvhd.start + 16);
        if (timescale > 0)
          return {
            width: null,
            height: null,
            durationSeconds: Math.round(duration / timescale),
          };
      }
    }
  } catch {
    /* Non-fatal */
  }
  return { width: null, height: null, durationSeconds: null };
}
