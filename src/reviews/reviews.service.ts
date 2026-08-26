import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { AntiSpamService } from '../common/anti-spam/anti-spam.service';
import { SubmitReviewDto, ModerateReviewDto, AdminCreateReviewDto, AdminUpdateReviewDto } from './dto/review.dto';
import { Prisma, ReviewStatus } from '../../generated/prisma/client';

export interface ReviewMediaItem {
  key: string;
  type: 'image' | 'video';
  altText?: string | null;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_MEDIA_FILES = 5;

const EMPTY_DISTRIBUTION = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly gcs: GcsService,
    private readonly assetUrls: AssetUrlService,
    private readonly antiSpam: AntiSpamService,
  ) {}

  // ── Verify order (pre-check before showing the write-review form) ──────────

  async verifyOrder(dto: { orderNumber: string; productId: string; email?: string | null; token?: string | null }) {
    const result = await this.orders.verifyOrderForReview(dto.orderNumber, dto.productId, { token: dto.token ?? undefined, email: dto.email ?? undefined });
    if (!result) return { verified: false, alreadyReviewed: false };

    const existing = await this.prisma.productReview.findUnique({ where: { orderId_productId: { orderId: result.order.id, productId: dto.productId } } });
    if (!existing) return { verified: true, alreadyReviewed: false };

    return {
      verified: true,
      alreadyReviewed: true,
      existing: {
        authorName: existing.authorName,
        rating: existing.rating,
        title: existing.title,
        body: existing.body,
        media: await this.resolveMedia(existing.media as unknown as ReviewMediaItem[]),
        status: existing.status,
      },
    };
  }

  // ── Submit (create or edit) ─────────────────────────────────────────────

  async submit(dto: SubmitReviewDto, files: Express.Multer.File[], meta: { ip: string | null; userAgent?: string }): Promise<{ ok: true }> {
    const spam = await this.antiSpam.evaluate({
      honeypot: dto._hp,
      renderedAt: dto._t,
      turnstileToken: dto._token,
      name: dto.authorName,
      contact: dto.orderNumber,
      subject: dto.title ?? '',
      message: dto.body ?? '',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    if (spam.decision === 'block') return { ok: true }; // silent — bot never learns it was blocked

    const verified = await this.orders.verifyOrderForReview(dto.orderNumber, dto.productId, { token: dto.token ?? undefined, email: dto.email ?? undefined });
    if (!verified) throw new BadRequestException('Unable to verify this order for this product');
    const { order } = verified;

    this.validateFiles(files);

    const existing = await this.prisma.productReview.findUnique({ where: { orderId_productId: { orderId: order.id, productId: dto.productId } } });
    const id = existing?.id ?? randomUUID();

    const keepKeys = this.parseKeepKeys(dto.keepMediaKeys);
    const existingMedia = (existing?.media as unknown as ReviewMediaItem[] | undefined) ?? [];
    const keptMedia = existingMedia.filter((m) => keepKeys.includes(m.key));
    const removedMedia = existingMedia.filter((m) => !keepKeys.includes(m.key));
    const uploadedMedia = await this.uploadMedia(id, files);
    const media = [...keptMedia, ...uploadedMedia];

    await this.prisma.$executeRaw`
      INSERT INTO shop_product_reviews (id, "productId", "orderId", "orderItemId", "userId", "authorName", "authorEmail", rating, title, body, media, status, "isVerifiedPurchase", "helpfulVotes", "rejectionReason", "moderatedAt", "moderatedBy", "createdAt", "updatedAt")
      VALUES (${id}, ${dto.productId}, ${order.id}, ${verified.orderItem.id}, NULL, ${dto.authorName}, ${order.customerEmail}, ${dto.rating}, ${dto.title ?? null}, ${dto.body ?? null}, ${JSON.stringify(media)}::jsonb, 'pending', true, 0, NULL, NULL, NULL, now(), now())
      ON CONFLICT ("orderId", "productId") DO UPDATE SET
        "authorName" = EXCLUDED."authorName",
        "authorEmail" = EXCLUDED."authorEmail",
        rating = EXCLUDED.rating,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        media = EXCLUDED.media,
        status = 'pending',
        "isVerifiedPurchase" = true,
        "rejectionReason" = NULL,
        "moderatedAt" = NULL,
        "moderatedBy" = NULL,
        "updatedAt" = now()
    `;

    Promise.allSettled(removedMedia.map((m) => this.gcs.delete(m.key))).catch(() => {});

    await this.recomputeProductStats(dto.productId);
    return { ok: true };
  }

  // ── Admin moderation ─────────────────────────────────────────────────────

  async moderate(id: string, dto: ModerateReviewDto, moderatedBy: string) {
    const review = await this.findOneOrThrow(id);
    const updated = await this.prisma.productReview.update({
      where: { id },
      data: {
        status: dto.status,
        moderatedAt: new Date(),
        moderatedBy,
        rejectionReason: dto.status === 'rejected' ? (dto.rejectionReason ?? null) : null,
      },
    });
    await this.recomputeProductStats(review.productId);
    return updated;
  }

  /**
   * A review entered by hand in admin, copied from a supplier or marketplace
   * listing for the same product.
   *
   * `isVerifiedPurchase` is pinned false and `source` to 'imported': there is no
   * order in this shop behind one of these, so it must never be able to carry a
   * badge that claims otherwise, whatever the caller sends.
   */
  async adminCreate(dto: AdminCreateReviewDto) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    const created = await this.prisma.productReview.create({
      data: {
        productId: dto.productId,
        authorName: dto.authorName,
        authorEmail: null,
        rating: dto.rating,
        title: dto.title ?? null,
        body: dto.body ?? null,
        media: (dto.media ?? []) as unknown as Prisma.InputJsonValue,
        status: dto.status ?? 'approved',
        isVerifiedPurchase: false,
        source: 'imported',
        sourceUrl: dto.sourceUrl ?? null,
        ...(dto.createdAt ? { createdAt: dto.createdAt } : {}),
      },
    });
    if (created.status === 'approved') await this.recomputeProductStats(created.productId);
    return { ...created, media: await this.resolveMedia(created.media as unknown as ReviewMediaItem[]) };
  }

  async adminUpdate(id: string, dto: AdminUpdateReviewDto) {
    await this.findOneOrThrow(id);
    const saved = await this.prisma.productReview.update({
      where: { id },
      data: {
        ...(dto.authorName !== undefined ? { authorName: dto.authorName } : {}),
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.createdAt !== undefined ? { createdAt: dto.createdAt } : {}),
        ...(dto.sourceUrl !== undefined ? { sourceUrl: dto.sourceUrl } : {}),
        ...(dto.media !== undefined ? { media: dto.media as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    if (saved.status === 'approved') await this.recomputeProductStats(saved.productId);
    return { ...saved, media: await this.resolveMedia(saved.media as unknown as ReviewMediaItem[]) };
  }

  async adminDelete(id: string): Promise<void> {
    const review = await this.findOneOrThrow(id);
    // Only a customer's own uploads are owned by the review. An imported one
    // points at media-library objects that other records may also use, so
    // deleting the review must not delete the picture out from under them.
    const media = review.source === 'customer' ? ((review.media as unknown as ReviewMediaItem[]) ?? []) : [];
    Promise.allSettled(media.map((m) => this.gcs.delete(m.key))).catch(() => {});
    await this.prisma.productReview.delete({ where: { id } });
    await this.recomputeProductStats(review.productId);
  }

  async adminList(status: ReviewStatus | undefined, limit = 20, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        include: { product: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.productReview.count({ where }),
    ]);
    const withMedia = await Promise.all(items.map(async (r) => ({ ...r, media: await this.resolveMedia(r.media as unknown as ReviewMediaItem[]) })));
    return { items: withMedia, total };
  }

  // ── Public reads ─────────────────────────────────────────────────────────

  async listForProduct(productId: string, limit = 20, offset = 0) {
    const where = { productId, status: 'approved' as ReviewStatus };
    const [items, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        select: { id: true, authorName: true, rating: true, title: true, body: true, media: true, isVerifiedPurchase: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.productReview.count({ where }),
    ]);
    const withMedia = await Promise.all(items.map(async (r) => ({ ...r, media: await this.resolveMedia(r.media as unknown as ReviewMediaItem[]) })));
    return { items: withMedia, total };
  }

  async getStats(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { ratingAverage: true, reviewCount: true, ratingDistribution: true } });
    if (!product) return { average: 0, count: 0, distribution: EMPTY_DISTRIBUTION };
    return { average: Number(product.ratingAverage), count: product.reviewCount, distribution: product.ratingDistribution };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async findOneOrThrow(id: string) {
    const review = await this.prisma.productReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  private async recomputeProductStats(productId: string): Promise<void> {
    const [row] = await this.prisma.$queryRaw<Array<{ avg_rating: string | null; review_count: bigint; distribution: Record<string, number> }>>`
      SELECT
        ROUND(AVG(rating)::numeric, 2) AS avg_rating,
        COUNT(*)::int AS review_count,
        jsonb_build_object(
          '1', COUNT(*) FILTER (WHERE rating = 1),
          '2', COUNT(*) FILTER (WHERE rating = 2),
          '3', COUNT(*) FILTER (WHERE rating = 3),
          '4', COUNT(*) FILTER (WHERE rating = 4),
          '5', COUNT(*) FILTER (WHERE rating = 5)
        ) AS distribution
      FROM shop_product_reviews WHERE "productId" = ${productId} AND status = 'approved'
    `;
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        ratingAverage: row?.avg_rating ? Number(row.avg_rating) : 0,
        reviewCount: row ? Number(row.review_count) : 0,
        ratingDistribution: row?.distribution ?? EMPTY_DISTRIBUTION,
      },
    });
  }

  private validateFiles(files: Express.Multer.File[]): void {
    if (files.length > MAX_MEDIA_FILES) throw new BadRequestException(`At most ${MAX_MEDIA_FILES} files allowed`);
    for (const f of files) {
      const isImage = ALLOWED_IMAGE_MIMES.has(f.mimetype);
      const isVideo = ALLOWED_VIDEO_MIMES.has(f.mimetype);
      if (!isImage && !isVideo) throw new BadRequestException(`Unsupported file type: ${f.mimetype}`);
      if (isImage && f.size > MAX_IMAGE_BYTES) throw new BadRequestException('Image exceeds the 8MB limit');
      if (isVideo && f.size > MAX_VIDEO_BYTES) throw new BadRequestException('Video exceeds the 50MB limit');
    }
  }

  private async uploadMedia(reviewId: string, files: Express.Multer.File[]): Promise<ReviewMediaItem[]> {
    const out: ReviewMediaItem[] = [];
    for (const file of files) {
      const isVideo = ALLOWED_VIDEO_MIMES.has(file.mimetype);
      const ext = file.originalname.includes('.') ? file.originalname.split('.').pop()! : isVideo ? 'mp4' : 'jpg';
      const key = `media/reviews/${reviewId}/${randomUUID()}.${ext}`;
      await this.gcs.upload(file.buffer, key, file.mimetype, 'publicRead');
      out.push({ key, type: isVideo ? 'video' : 'image' });
    }
    return out;
  }

  private async resolveMedia(media: ReviewMediaItem[]): Promise<Array<ReviewMediaItem & { url: string }>> {
    if (!media?.length) return [];
    const urlMap = await this.assetUrls.resolveBatch(media.map((m) => m.key));
    return media.map((m) => ({ ...m, url: urlMap.get(m.key) ?? '' }));
  }

  private parseKeepKeys(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
    } catch {
      return [];
    }
  }
}
