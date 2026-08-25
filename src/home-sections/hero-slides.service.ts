import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { TranslationsService } from '../translations/translations.service';
import { CreateHeroSlideDto, UpdateHeroSlideDto } from './dto/hero-slide.dto';

const ET_HOME_HERO_SLIDE = 'shop_home_hero_slide';

@Injectable()
export class HeroSlidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetUrls: AssetUrlService,
    private readonly translations: TranslationsService,
  ) {}

  /** Admin view: every slide, active or not, in display order. */
  async adminList() {
    const slides = await this.prisma.homeHeroSlide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return this.withImageUrls(slides);
  }

  /**
   * Storefront view: only what should render, in order.
   *
   * An empty list is meaningful — it means no slide has been authored, and the
   * carousel falls back to the built-in copy from the translation file. Same
   * contract as the home-section layout.
   */
  async publicList(lang?: string) {
    const slides = await this.prisma.homeHeroSlide.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const withUrls = await this.withImageUrls(slides);
    return this.translations.maybeApply(withUrls, ET_HOME_HERO_SLIDE, lang);
  }

  async create(dto: CreateHeroSlideDto) {
    // New slides land at the end, so adding one never reshuffles the rotation.
    const sortOrder = dto.sortOrder || (await this.nextSortOrder());
    const slide = await this.prisma.homeHeroSlide.create({
      data: { ...dto, sortOrder },
    });
    return this.withImageUrl(slide);
  }

  async update(id: string, dto: UpdateHeroSlideDto) {
    await this.assertExists(id);
    const slide = await this.prisma.homeHeroSlide.update({ where: { id }, data: dto });
    return this.withImageUrl(slide);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.homeHeroSlide.delete({ where: { id } });
    await this.translations.deleteForEntity(ET_HOME_HERO_SLIDE, id);
  }

  /** Rewrites sortOrder from the given id order, in one transaction so a partial
   *  failure can't leave the rotation half-reordered. */
  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.homeHeroSlide.update({ where: { id }, data: { sortOrder: index + 1 } }),
      ),
    );
    return this.adminList();
  }

  private async withImageUrls<T extends { imageKey: string | null }>(slides: T[]): Promise<Array<T & { imageUrl: string | null }>> {
    const keys = slides.map((s) => s.imageKey).filter((k): k is string => !!k);
    const urlMap = keys.length ? await this.assetUrls.resolveBatch(keys) : new Map<string, string>();
    return slides.map((s) => ({ ...s, imageUrl: s.imageKey ? (urlMap.get(s.imageKey) ?? null) : null }));
  }

  private async withImageUrl<T extends { imageKey: string | null }>(slide: T): Promise<T & { imageUrl: string | null }> {
    const [withUrl] = await this.withImageUrls([slide]);
    return withUrl;
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.homeHeroSlide.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.homeHeroSlide.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Hero slide not found');
  }
}
