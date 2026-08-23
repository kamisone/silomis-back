import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';
import { ProductTag } from '../../../generated/prisma/client';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<ProductTag[]> {
    return this.prisma.productTag.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<ProductTag> {
    const tag = await this.prisma.productTag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return tag;
  }

  async create(dto: CreateTagDto): Promise<ProductTag> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertUnique(dto.name, slug);
    return this.prisma.productTag.create({ data: { name: dto.name, slug } });
  }

  async update(id: string, dto: UpdateTagDto): Promise<ProductTag> {
    await this.findOne(id);
    const slug = dto.slug !== undefined ? slugify(dto.slug) : undefined;
    if (dto.name !== undefined || slug !== undefined) {
      await this.assertUnique(dto.name, slug, id);
    }
    return this.prisma.productTag.update({ where: { id }, data: { name: dto.name, slug } });
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.findOne(id);
    await this.prisma.productTag.delete({ where: { id } });
    return { ok: true };
  }

  private async assertUnique(name?: string, slug?: string, excludeId?: string): Promise<void> {
    if (!name && !slug) return;
    const existing = await this.prisma.productTag.findFirst({
      where: { OR: [...(name ? [{ name }] : []), ...(slug ? [{ slug }] : [])] },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Tag "${name ?? slug}" already exists`);
    }
  }
}
