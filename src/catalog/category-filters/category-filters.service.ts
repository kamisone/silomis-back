import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';
import { CreateCategoryFilterDto, CreateFilterValueDto, UpdateCategoryFilterDto, UpdateFilterValueDto } from './dto/category-filter.dto';

/** Translates a Postgres unique-violation into a friendly 409 instead of an opaque 500. */
function rethrowAsConflict(err: unknown, label: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException(`${label} already exists — choose a different value.`);
  }
  throw err;
}


@Injectable()
export class CategoryFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ────────────────────────────────────────────────────────────

  /** Admin: every filter on this category, active or not, with every value. */
  findAllForCategory(categoryId: string) {
    return this.prisma.categoryFilter.findMany({
      where: { categoryId },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Storefront: only filters flagged active, each with every one of its
   *  values — a value has no active/inactive toggle of its own, deleting it
   *  is the only way to retire one. */
  findActiveForCategory(categoryId: string) {
    return this.prisma.categoryFilter.findMany({
      where: { categoryId, isActive: true },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const filter = await this.prisma.categoryFilter.findUnique({
      where: { id },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!filter) throw new NotFoundException(`Category filter ${id} not found`);
    return filter;
  }

  /**
   * The slider's own endpoints — admin-set on the category (see
   * CategoriesService.assertValidPriceFilterBounds for where the pair is
   * enforced), not derived from the category's current products. A range
   * pinned to whatever happened to be in stock would shift under a shopper
   * as stock changed, and a category with one product — or several sharing
   * one price — would get a slider with nothing to drag between.
   *
   * Returns null whenever there's nothing valid to show: the filter is off,
   * or (only possible on a row saved before this pair existed) one or both
   * bounds were never set.
   */
  async priceBounds(categoryId: string): Promise<{ minCents: number; maxCents: number } | null> {
    const category = await this.prisma.productCategory.findUnique({
      where: { id: categoryId },
      select: { showPriceFilter: true, priceFilterMinCents: true, priceFilterMaxCents: true },
    });
    if (!category?.showPriceFilter) return null;
    if (category.priceFilterMinCents == null || category.priceFilterMaxCents == null) return null;
    return { minCents: category.priceFilterMinCents, maxCents: category.priceFilterMaxCents };
  }

  // ── Filters ──────────────────────────────────────────────────────────

  /**
   * Creates the filter and its values in one transaction, then backfills:
   * every product already in this category gets a ProductFilterValue for the
   * new filter's default value. This is the one automatic-backfill path in
   * the system — editing an existing filter's values later does not
   * retroactively touch products that already have a value for it.
   */
  async createFilter(categoryId: string, dto: CreateCategoryFilterDto) {
    const category = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);

    // Exactly one value is the default: whichever the admin flagged, or the
    // first one when none was — a filter with values but no default would
    // leave the "new filter" backfill below with nothing to assign.
    const defaultIndex = Math.max(0, dto.values.findIndex((v) => v.isDefault));

    let filterId: string;
    let defaultValueId: string;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const filter = await tx.categoryFilter.create({
          data: {
            categoryId,
            name: dto.name,
            slug: dto.slug ? slugify(dto.slug) : slugify(dto.name),
            sortOrder: dto.sortOrder ?? 0,
            isActive: dto.isActive ?? true,
          },
        });

        // One at a time, not createMany — createMany doesn't return the rows,
        // and the default one's id is what the backfill below needs.
        const values = await Promise.all(
          dto.values.map((v, i) =>
            tx.categoryFilterValue.create({
              data: {
                filterId: filter.id,
                value: v.value,
                label: v.label,
                sortOrder: v.sortOrder ?? i,
                isDefault: i === defaultIndex,
              },
            }),
          ),
        );

        return { filter, defaultValue: values[defaultIndex] };
      });
      filterId = created.filter.id;
      defaultValueId = created.defaultValue.id;
    } catch (err) {
      rethrowAsConflict(err, 'A filter with this name/slug, or one of its values,');
    }

    const products = await this.prisma.product.findMany({
      where: { categories: { some: { id: categoryId } } },
      select: { id: true },
    });
    if (products.length) {
      await this.prisma.productFilterValue.createMany({
        data: products.map((p) => ({ productId: p.id, filterId, valueId: defaultValueId })),
        skipDuplicates: true,
      });
    }

    return this.findOne(filterId);
  }

  async updateFilter(id: string, dto: UpdateCategoryFilterDto) {
    await this.findOne(id);
    try {
      return await this.prisma.categoryFilter.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug !== undefined ? slugify(dto.slug) : undefined,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
        include: { values: { orderBy: { sortOrder: 'asc' } } },
      });
    } catch (err) {
      rethrowAsConflict(err, 'A filter with this name/slug');
    }
  }

  async deleteFilter(id: string): Promise<void> {
    await this.findOne(id);
    // Cascades: shop_category_filter_values and shop_product_filter_values
    // both onDelete: Cascade off this row.
    await this.prisma.categoryFilter.delete({ where: { id } });
  }

  // ── Values ───────────────────────────────────────────────────────────

  async addValue(filterId: string, dto: CreateFilterValueDto) {
    await this.findOne(filterId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) await tx.categoryFilterValue.updateMany({ where: { filterId }, data: { isDefault: false } });
        return tx.categoryFilterValue.create({
          data: {
            filterId,
            value: dto.value,
            label: dto.label,
            sortOrder: dto.sortOrder ?? 0,
            isDefault: dto.isDefault ?? false,
          },
        });
      });
    } catch (err) {
      rethrowAsConflict(err, 'This filter value');
    }
  }

  async updateValue(valueId: string, dto: UpdateFilterValueDto) {
    const existing = await this.prisma.categoryFilterValue.findUnique({ where: { id: valueId } });
    if (!existing) throw new NotFoundException(`Filter value ${valueId} not found`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.categoryFilterValue.updateMany({
            where: { filterId: existing.filterId, id: { not: valueId } },
            data: { isDefault: false },
          });
        }
        return tx.categoryFilterValue.update({ where: { id: valueId }, data: dto });
      });
    } catch (err) {
      rethrowAsConflict(err, 'This filter value');
    }
  }

  async deleteValue(valueId: string): Promise<void> {
    const existing = await this.prisma.categoryFilterValue.findUnique({ where: { id: valueId } });
    if (!existing) throw new NotFoundException(`Filter value ${valueId} not found`);
    // Cascades: shop_product_filter_values rows pointing at this value go
    // with it — a product that had this value simply has no value for the
    // filter any more, same as removing an out-of-stock variant option.
    await this.prisma.categoryFilterValue.delete({ where: { id: valueId } });
  }
}
