import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';
import {
  CreateOptionValueDto,
  CreateVariantAttributeDto,
  UpdateOptionValueDto,
  UpdateVariantAttributeDto,
} from './dto/variant-attribute.dto';

/** Translates a Postgres unique-violation into a friendly 409 instead of an opaque 500. */
function rethrowAsConflict(err: unknown, label: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException(`${label} already exists — choose a different value.`);
  }
  throw err;
}

@Injectable()
export class VariantAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin listing, ordered by the internal label.
   *
   * `adminLabel` exists to tell apart attributes that share one storefront
   * `name` ("Couleur (textile)" vs "Couleur (bois)"), so it is what an admin
   * scans this list by — sorting by `sortOrder` put them in the storefront's
   * picker order instead, which says nothing about which is which.
   *
   * Falls back to `name` for an attribute with no internal label, rather than
   * sinking every unlabelled one to the bottom: the result is one alphabetical
   * list where the internal label wins wherever it is set.
   *
   * Sorted here rather than in the query because the order is over
   * COALESCE(adminLabel, name), which Prisma's orderBy cannot express — and
   * localeCompare gets accents right ("Épaisseur" next to E, not after Z),
   * which a Postgres C-collation ORDER BY would not. Safe in memory: this is a
   * small reference table with no pagination.
   */
  async findAll() {
    const attributes = await this.prisma.variantAttribute.findMany({
      include: { optionValues: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const label = (a: { adminLabel: string | null; name: string }) => a.adminLabel?.trim() || a.name;
    return attributes.sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: 'base', numeric: true }));
  }

  findActive() {
    return this.prisma.variantAttribute.findMany({
      where: { isActive: true },
      include: { optionValues: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }],
    });
  }

  async findOne(id: string) {
    const attr = await this.prisma.variantAttribute.findUnique({
      where: { id },
      include: { optionValues: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!attr) throw new NotFoundException(`Variant attribute ${id} not found`);
    return attr;
  }

  async create(dto: CreateVariantAttributeDto) {
    try {
      return await this.prisma.variantAttribute.create({
        data: {
          name: dto.name,
          slug: dto.slug ? slugify(dto.slug) : slugify(dto.name),
          adminLabel: dto.adminLabel ?? null,
          categoryId: dto.categoryId ?? null,
          displayType: dto.displayType,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
        include: { optionValues: true },
      });
    } catch (err) {
      rethrowAsConflict(err, 'A variant attribute');
    }
  }

  async update(id: string, dto: UpdateVariantAttributeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.variantAttribute.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug !== undefined ? slugify(dto.slug) : undefined,
          adminLabel: dto.adminLabel,
          categoryId: dto.categoryId,
          displayType: dto.displayType,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
        include: { optionValues: { orderBy: { sortOrder: 'asc' } } },
      });
    } catch (err) {
      rethrowAsConflict(err, 'A variant attribute');
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.variantAttribute.delete({ where: { id } });
  }

  // ── Option values ───────────────────────────────────────────────────────

  async addValue(attributeId: string, dto: CreateOptionValueDto) {
    await this.findOne(attributeId);
    try {
      return await this.prisma.variationOptionValue.create({
        data: {
          attributeId,
          value: dto.value,
          displayValue: dto.displayValue ?? null,
          swatchValue: dto.swatchValue ?? null,
          swatchType: dto.swatchType ?? null,
          priceAdjustmentCents: dto.priceAdjustmentCents ?? null,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (err) {
      rethrowAsConflict(err, 'This option value');
    }
  }

  async updateValue(valueId: string, dto: UpdateOptionValueDto) {
    const existing = await this.prisma.variationOptionValue.findUnique({ where: { id: valueId } });
    if (!existing) throw new NotFoundException(`Option value ${valueId} not found`);
    try {
      return await this.prisma.variationOptionValue.update({ where: { id: valueId }, data: dto });
    } catch (err) {
      rethrowAsConflict(err, 'This option value');
    }
  }

  async removeValue(valueId: string): Promise<void> {
    const existing = await this.prisma.variationOptionValue.findUnique({ where: { id: valueId } });
    if (!existing) throw new NotFoundException(`Option value ${valueId} not found`);
    await this.prisma.variationOptionValue.delete({ where: { id: valueId } });
  }
}
