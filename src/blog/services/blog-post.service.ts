import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationsService } from '../../translations/translations.service';
import { slugify } from '../../common/utils/slug.util';
import { calculateReadingTime } from '../blog.util';
import {
  BlogPost,
  BlogPostStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { CreateBlogPostDto, UpdateBlogPostDto } from '../dto/blog-post.dto';

export const ET_BLOG_POST = 'blog_post';

const POST_INCLUDE = {
  categories: true,
  tags: true,
} satisfies Prisma.BlogPostInclude;
type PostWithRelations = Prisma.BlogPostGetPayload<{
  include: typeof POST_INCLUDE;
}>;

export interface AdminListFilter {
  status?: BlogPostStatus;
  categoryId?: string;
  tagId?: string;
  search?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

export interface PublicListFilter {
  categoryId?: string;
  tagId?: string;
  search?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
  lang?: string;
}

@Injectable()
export class BlogPostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrl: AssetUrlService,
    private readonly translations: TranslationsService,
  ) {}

  // ── Image enrichment ──────────────────────────────────────────────────────

  private async enrichOne<T extends { featuredImageKey: string | null }>(
    post: T,
  ): Promise<T & { featuredImageUrl: string | null }> {
    const url = post.featuredImageKey
      ? await this.assetUrl.resolve(post.featuredImageKey)
      : null;
    return { ...post, featuredImageUrl: url };
  }

  private async enrichMany<T extends { featuredImageKey: string | null }>(
    posts: T[],
  ): Promise<(T & { featuredImageUrl: string | null })[]> {
    if (!posts.length) return [];
    const keys = posts
      .map((p) => p.featuredImageKey)
      .filter((k): k is string => !!k);
    const urlMap = keys.length
      ? await this.assetUrl.resolveBatch(keys)
      : new Map<string, string>();
    return posts.map((p) => ({
      ...p,
      featuredImageUrl: p.featuredImageKey
        ? (urlMap.get(p.featuredImageKey) ?? null)
        : null,
    }));
  }

  // ── Slug ──────────────────────────────────────────────────────────────────

  private async generateUniqueSlug(
    base: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = slugify(base);
    let slug = baseSlug;
    let counter = 2;
    while (true) {
      const existing = await this.prisma.blogPost.findUnique({
        where: { slug },
      });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }

  private resolvePublishedAt(
    status: BlogPostStatus | undefined,
    existing: Date | null,
  ): Date | null {
    if (status === 'published' && !existing) return new Date();
    return existing;
  }

  private buildWhere(filter: {
    categoryId?: string;
    tagId?: string;
    search?: string;
    featured?: boolean;
  }): Prisma.BlogPostWhereInput {
    const where: Prisma.BlogPostWhereInput = {};
    if (filter.featured !== undefined) where.featured = filter.featured;
    if (filter.categoryId)
      where.categories = { some: { id: filter.categoryId } };
    if (filter.tagId) where.tags = { some: { id: filter.tagId } };
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { excerpt: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  async adminList(
    filter: AdminListFilter = {},
  ): Promise<{ items: unknown[]; total: number }> {
    const where = this.buildWhere(filter);
    if (filter.status) where.status = filter.status;

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const [total, raw] = await Promise.all([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const items = await this.enrichMany(raw);
    return { items, total };
  }

  async adminFindOne(id: string): Promise<unknown> {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return this.enrichOne(post);
  }

  async create(dto: CreateBlogPostDto): Promise<unknown> {
    const slug = await this.generateUniqueSlug(dto.slug ?? dto.title);
    const status = dto.status ?? 'draft';

    const post = await this.prisma.blogPost.create({
      data: {
        slug,
        status,
        title: dto.title,
        excerpt: dto.excerpt ?? null,
        content: dto.content ?? null,
        featuredImageKey: dto.featuredImageKey ?? null,
        featuredImageAlt: dto.featuredImageAlt ?? null,
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        canonicalUrl: dto.canonicalUrl ?? null,
        scheduledPublishAt: dto.scheduledPublishAt
          ? new Date(dto.scheduledPublishAt)
          : null,
        featured: dto.featured ?? false,
        authorName: dto.authorName ?? null,
        readingTimeMinutes: calculateReadingTime(dto.content),
        publishedAt: this.resolvePublishedAt(status, null),
        categories: dto.categoryIds?.length
          ? { connect: dto.categoryIds.map((id) => ({ id })) }
          : undefined,
        tags: dto.tagIds?.length
          ? { connect: dto.tagIds.map((id) => ({ id })) }
          : undefined,
      },
      include: POST_INCLUDE,
    });

    return this.enrichOne(post);
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<unknown> {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Post ${id} not found`);

    let slug: string | undefined;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateUniqueSlug(dto.slug, id);
    } else if (
      dto.title &&
      dto.title !== existing.title &&
      !dto.slug &&
      existing.status === 'draft'
    ) {
      slug = await this.generateUniqueSlug(dto.title, id);
    }

    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        slug,
        status: dto.status,
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content,
        readingTimeMinutes:
          dto.content !== undefined
            ? calculateReadingTime(dto.content)
            : undefined,
        featuredImageKey: dto.featuredImageKey,
        featuredImageAlt: dto.featuredImageAlt,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        canonicalUrl: dto.canonicalUrl,
        scheduledPublishAt:
          dto.scheduledPublishAt !== undefined
            ? dto.scheduledPublishAt
              ? new Date(dto.scheduledPublishAt)
              : null
            : undefined,
        featured: dto.featured,
        authorName: dto.authorName,
        publishedAt: this.resolvePublishedAt(dto.status, existing.publishedAt),
        categories:
          dto.categoryIds !== undefined
            ? { set: dto.categoryIds.map((cid) => ({ id: cid })) }
            : undefined,
        tags:
          dto.tagIds !== undefined
            ? { set: dto.tagIds.map((tid) => ({ id: tid })) }
            : undefined,
      },
      include: POST_INCLUDE,
    });

    return this.enrichOne(post);
  }

  async publish(id: string): Promise<unknown> {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Post ${id} not found`);
    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: existing.publishedAt ?? new Date(),
      },
      include: POST_INCLUDE,
    });
    return this.enrichOne(post);
  }

  async archive(id: string): Promise<unknown> {
    const post = await this.prisma.blogPost.update({
      where: { id },
      data: { status: 'archived' },
      include: POST_INCLUDE,
    });
    return this.enrichOne(post);
  }

  async remove(id: string): Promise<void> {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    if (post.featuredImageKey)
      void this.assetUrl.invalidate(post.featuredImageKey);
    await this.translations.deleteForEntity(ET_BLOG_POST, id);
    await this.prisma.blogPost.delete({ where: { id } });
  }

  // ── Public ────────────────────────────────────────────────────────────────

  async publicList(
    filter: PublicListFilter = {},
  ): Promise<{ items: unknown[]; total: number }> {
    const where = this.buildWhere(filter);
    where.status = 'published';

    const limit = Math.min(filter.limit ?? 12, 50);
    const offset = filter.offset ?? 0;

    const [total, raw] = await Promise.all([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
    ]);

    const enriched = await this.enrichMany(raw);
    const items = await this.translations.maybeApply(
      enriched as unknown as Record<string, unknown>[],
      ET_BLOG_POST,
      filter.lang,
    );
    return { items, total };
  }

  async publicFindBySlug(slug: string, lang?: string): Promise<unknown> {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: 'published' },
      include: POST_INCLUDE,
    });
    if (!post) throw new NotFoundException(`Post "${slug}" not found`);
    const enriched = await this.enrichOne(post);
    return this.translations.maybeApplyOne(
      enriched as unknown as Record<string, unknown>,
      ET_BLOG_POST,
      lang,
    );
  }

  async publicRelated(postId: string, limit = 3): Promise<unknown[]> {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
      include: POST_INCLUDE,
    });
    if (!post || !post.categories.length) {
      const fallback = await this.prisma.blogPost.findMany({
        where: { status: 'published' },
        include: POST_INCLUDE,
        orderBy: { publishedAt: 'desc' },
        take: limit,
      });
      return this.enrichMany(fallback);
    }
    const catIds = post.categories.map((c) => c.id);
    const related = await this.prisma.blogPost.findMany({
      where: {
        status: 'published',
        id: { not: postId },
        categories: { some: { id: { in: catIds } } },
      },
      include: POST_INCLUDE,
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
    return this.enrichMany(related);
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────

  async publishDue(): Promise<number> {
    const due = await this.prisma.blogPost.findMany({
      where: { status: 'scheduled', scheduledPublishAt: { lte: new Date() } },
      select: { id: true, publishedAt: true },
    });
    if (!due.length) return 0;
    await this.prisma.$transaction(
      due.map((p) =>
        this.prisma.blogPost.update({
          where: { id: p.id },
          data: {
            status: 'published',
            publishedAt: p.publishedAt ?? new Date(),
          },
        }),
      ),
    );
    return due.length;
  }
}

export type { PostWithRelations, BlogPost };
