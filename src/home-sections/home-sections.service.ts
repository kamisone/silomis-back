import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  CreateHomeSectionDto,
  DEFAULT_HOME_SECTIONS,
  UpdateHomeSectionDto,
} from './dto/home-section.dto';

@Injectable()
export class HomeSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin view: every section, active or not, in display order. */
  adminList() {
    return this.prisma.homeSection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Storefront view: only what should render, in order.
   *
   * An empty table is not an empty home page — it means "never configured", and
   * the storefront falls back to its built-in default layout. Returning [] here
   * is what signals that, so the fallback lives in exactly one place (the
   * frontend registry) rather than being duplicated as seed data.
   */
  publicList() {
    return this.prisma.homeSection.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, type: true, config: true },
    });
  }

  async create(dto: CreateHomeSectionDto) {
    // A new section lands at the bottom unless the caller placed it explicitly,
    // so adding one never silently reshuffles the page.
    const sortOrder = dto.sortOrder || (await this.nextSortOrder());
    return this.prisma.homeSection.create({
      data: {
        type: dto.type,
        sortOrder,
        isActive: dto.isActive,
        config: dto.config as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, dto: UpdateHomeSectionDto) {
    await this.assertExists(id);
    return this.prisma.homeSection.update({
      where: { id },
      data: {
        type: dto.type,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        config: dto.config !== undefined ? (dto.config as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.homeSection.delete({ where: { id } });
  }

  /** Rewrites sortOrder from the given id order — one transaction so a partial
   *  failure can't leave the page half-reordered. */
  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.homeSection.update({ where: { id }, data: { sortOrder: index + 1 } }),
      ),
    );
    return this.adminList();
  }

  /** Replaces the whole layout with the built-in default. Also the "start
   *  customizing" action: it materializes the implicit fallback into rows an
   *  admin can then reorder and switch off. */
  async restoreDefaults() {
    await this.prisma.$transaction([
      this.prisma.homeSection.deleteMany({}),
      this.prisma.homeSection.createMany({
        data: DEFAULT_HOME_SECTIONS.map((section, index) => ({
          type: section.type,
          sortOrder: index + 1,
          isActive: true,
          config: section.config as Prisma.InputJsonValue,
        })),
      }),
    ]);
    return this.adminList();
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.homeSection.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.homeSection.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Home section not found');
  }
}
