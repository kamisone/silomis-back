import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StoreBrand } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { TranslationsService } from '../translations/translations.service';
import { ET_STORE_BRAND } from '../translations/translation-entities';
import type { EmailBrand } from '../email/templates/layout';
import {
  CreateStoreBrandDto,
  UpdateStoreBrandDto,
} from './dto/store-brand.dto';
import { storeBrandIdForProducts } from './store-brand-of.util';

export interface StoreBrandFaq {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * What every page and message of a brand needs to look like the brand: the
 * neutral header and footer, the tab icon, the tracking page, the emails.
 * Small on purpose — the storefront keeps it in localStorage so the cart and
 * checkout can show it without asking again.
 */
export interface StoreBrandChrome {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  footerText: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  /** Whether the brand has an About page to link to. */
  hasAbout: boolean;
  /** Whether the brand has FAQ entries to link to. */
  hasFaq: boolean;
  /** Where its logo leads when the visitor came from nowhere in particular — its first product on sale. */
  homeSlug: string | null;
}

/** The brand's own pages: About, Contact, FAQ, Returns, and its SEO defaults. */
export interface StoreBrandPage extends StoreBrandChrome {
  aboutTitle: string | null;
  aboutHtml: string | null;
  contactIntro: string | null;
  returnsNote: string | null;
  faqs: StoreBrandFaq[];
  seoTitle: string | null;
  seoDescription: string | null;
  shareImageUrl: string | null;
}

/** Fields an admin translates; FAQ items go as "faq:<id>:question|answer". */
export const STORE_BRAND_TRANSLATABLE = [
  'tagline',
  'footerText',
  'aboutTitle',
  'aboutHtml',
  'contactIntro',
  'returnsNote',
  'seoTitle',
  'seoDescription',
] as const;

function faqsOf(value: Prisma.JsonValue): StoreBrandFaq[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (f): f is Prisma.JsonObject =>
        !!f && typeof f === 'object' && !Array.isArray(f),
    )
    .map((f, i) => ({
      id: String(f.id ?? ''),
      question: String(f.question ?? ''),
      answer: String(f.answer ?? ''),
      sortOrder: typeof f.sortOrder === 'number' ? f.sortOrder : i,
      isActive: f.isActive !== false,
    }));
}

/** The entries the FAQ page shows: switched on and filled in. */
function publicFaqs(faqs: StoreBrandFaq[]): StoreBrandFaq[] {
  return faqs.filter((f) => f.isActive && f.question.trim() && f.answer.trim());
}

function hasText(html: string | null | undefined): boolean {
  return !!html && html.replace(/<[^>]*>/g, '').trim().length > 0;
}

@Injectable()
export class StoreBrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly translations: TranslationsService,
  ) {}

  // ── Public ───────────────────────────────────────────────────────────────

  /** A brand's identity, translated — null when it is missing or switched off (the product then falls back to Silomis). */
  async chromeFor(
    brandId: string | null | undefined,
    lang?: string,
  ): Promise<StoreBrandChrome | null> {
    if (!brandId) return null;
    const brand = await this.prisma.storeBrand.findUnique({
      where: { id: brandId },
    });
    if (!brand?.isActive) return null;
    return this.toChrome(await this.translate(brand, lang));
  }

  /** What a customer email needs to be sent under the brand — see EmailBrand. */
  async emailBrandFor(
    brandId: string | null | undefined,
    lang?: string,
  ): Promise<EmailBrand | null> {
    const chrome = await this.chromeFor(brandId, lang);
    return chrome
      ? {
          name: chrome.name,
          tagline: chrome.tagline,
          logoUrl: chrome.iconUrl,
          supportEmail: chrome.supportEmail,
        }
      : null;
  }

  /** The brand of the products in a basket — the abandoned-cart email has no order to read it from. */
  async emailBrandForProducts(
    productIds: string[],
    lang?: string,
  ): Promise<EmailBrand | null> {
    return this.emailBrandFor(
      await storeBrandIdForProducts(this.prisma, productIds),
      lang,
    );
  }

  async pageBySlug(slug: string, lang?: string): Promise<StoreBrandPage> {
    const brand = await this.prisma.storeBrand.findUnique({ where: { slug } });
    if (!brand?.isActive) throw new NotFoundException('Brand not found');
    const t = await this.translate(brand, lang);
    const [chrome, shareImageUrl] = await Promise.all([
      this.toChrome(t),
      t.shareImageKey ? this.assetUrls.resolve(t.shareImageKey) : null,
    ]);
    return {
      ...chrome,
      aboutTitle: t.aboutTitle,
      aboutHtml: hasText(t.aboutHtml) ? t.aboutHtml : null,
      contactIntro: t.contactIntro,
      returnsNote: t.returnsNote,
      faqs: publicFaqs(faqsOf(t.faqs)),
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
      shareImageUrl,
    };
  }

  /** Overlays the brand's translations, FAQ items included. */
  private async translate(
    brand: StoreBrand,
    lang?: string,
  ): Promise<StoreBrand> {
    if (!lang) return brand;
    const translated = (await this.translations.applyToEntity(
      { ...brand, faqs: faqsOf(brand.faqs) } as unknown as Record<
        string,
        unknown
      >,
      ET_STORE_BRAND,
      lang,
    )) as Record<string, unknown>;
    this.translations.applyNestedInPlace(translated, { faq: 'faqs' });
    return translated as unknown as StoreBrand;
  }

  private async toChrome(brand: StoreBrand): Promise<StoreBrandChrome> {
    const [urls, home] = await Promise.all([
      this.assetUrls.resolveBatch(
        [brand.logoKey, brand.iconKey].filter((k): k is string => !!k),
      ),
      this.prisma.product.findFirst({
        where: { storeBrandId: brand.id, status: 'active', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { slug: true },
      }),
    ]);
    return {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      tagline: brand.tagline,
      logoUrl: brand.logoKey ? (urls.get(brand.logoKey) ?? null) : null,
      iconUrl: brand.iconKey ? (urls.get(brand.iconKey) ?? null) : null,
      footerText: brand.footerText,
      supportEmail: brand.supportEmail,
      supportPhone: brand.supportPhone,
      hasAbout: hasText(brand.aboutHtml),
      hasFaq: publicFaqs(faqsOf(brand.faqs)).length > 0,
      homeSlug: home?.slug ?? null,
    };
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminList() {
    const brands = await this.prisma.storeBrand.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
    });
    const urls = await this.assetUrls.resolveBatch(
      brands
        .flatMap((b) => [b.logoKey, b.iconKey])
        .filter((k): k is string => !!k),
    );
    return brands.map(({ _count, ...b }) => ({
      ...b,
      logoUrl: b.logoKey ? (urls.get(b.logoKey) ?? null) : null,
      iconUrl: b.iconKey ? (urls.get(b.iconKey) ?? null) : null,
      productCount: _count.products,
    }));
  }

  async findById(id: string) {
    const brand = await this.prisma.storeBrand.findUnique({
      where: { id },
      include: {
        products: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            featuredImageKey: true,
          },
          orderBy: { title: 'asc' },
        },
      },
    });
    if (!brand) throw new NotFoundException('Brand not found');
    const urls = await this.assetUrls.resolveBatch(
      [
        brand.logoKey,
        brand.iconKey,
        brand.shareImageKey,
        ...brand.products.map((p) => p.featuredImageKey),
      ].filter((k): k is string => !!k),
    );
    const url = (k: string | null) => (k ? (urls.get(k) ?? null) : null);
    return {
      ...brand,
      faqs: faqsOf(brand.faqs),
      logoUrl: url(brand.logoKey),
      iconUrl: url(brand.iconKey),
      shareImageUrl: url(brand.shareImageKey),
      products: brand.products.map(({ featuredImageKey, ...p }) => ({
        ...p,
        featuredImageUrl: url(featuredImageKey),
      })),
    };
  }

  async create(dto: CreateStoreBrandDto) {
    await this.assertSlugAvailable(dto.slug);
    const created = await this.prisma.storeBrand.create({
      data: this.toData(dto) as Prisma.StoreBrandCreateInput,
    });
    return this.findById(created.id);
  }

  async update(id: string, dto: UpdateStoreBrandDto) {
    await this.findById(id);
    if (dto.slug !== undefined) await this.assertSlugAvailable(dto.slug, id);
    await this.prisma.storeBrand.update({
      where: { id },
      data: this.toData(dto),
    });
    return this.findById(id);
  }

  /** Its products go back to Silomis (the foreign key sets them to null); past orders keep nothing but their history. */
  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.storeBrand.delete({ where: { id } });
    await this.translations.deleteForEntity(ET_STORE_BRAND, id);
  }

  async linkProduct(id: string, productId: string) {
    await this.findById(id);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.product.update({
      where: { id: productId },
      data: { storeBrandId: id },
    });
    return this.findById(id);
  }

  async unlinkProduct(id: string, productId: string) {
    const { count } = await this.prisma.product.updateMany({
      where: { id: productId, storeBrandId: id },
      data: { storeBrandId: null },
    });
    if (!count)
      throw new NotFoundException('Product is not linked to this brand');
    return this.findById(id);
  }

  /**
   * The DTO's keys are the column names, and zod has already dropped anything
   * else — so the parsed body is written whole. Building `data` field by field
   * is how a validated field ends up silently never saved.
   */
  private toData(dto: UpdateStoreBrandDto): Prisma.StoreBrandUpdateInput {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      data[key] =
        typeof value === 'string' && key !== 'slug' && key !== 'name'
          ? value.trim() || null
          : value;
    }
    if (dto.faqs) data.faqs = dto.faqs as unknown as Prisma.InputJsonValue;
    return data as Prisma.StoreBrandUpdateInput;
  }

  private async assertSlugAvailable(
    slug: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.storeBrand.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing && existing.id !== exceptId)
      throw new ConflictException(`A brand with slug "${slug}" already exists`);
  }
}
