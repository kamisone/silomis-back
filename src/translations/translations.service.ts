// Translation system — domain split:
// This service owns per-entity content translations (e.g. product name, description) stored in the DB.
// Static UI strings (nav, forms, legal) live in the frontend translations file — do not duplicate them here.
// Call applyToEntities() / applyToEntity() after fetching entities whenever a `lang` param is present.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Translation } from '../../generated/prisma/client';
import { BulkUpsertTranslationDto } from './dto/bulk-upsert-translation.dto';
import { UpsertTranslationDto } from './dto/upsert-translation.dto';

@Injectable()
export class TranslationsService {
  constructor(private readonly prisma: PrismaService) {}

  upsert(dto: UpsertTranslationDto): Promise<Translation> {
    const where = {
      entityType_entityId_field_lang: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        field: dto.field,
        lang: dto.lang,
      },
    };
    return this.prisma.translation.upsert({ where, create: dto, update: { value: dto.value } });
  }

  async bulkUpsert(dto: BulkUpsertTranslationDto): Promise<void> {
    await this.prisma.$transaction(dto.items.map((item) => this.buildUpsert(item)));
  }

  private buildUpsert(item: UpsertTranslationDto) {
    return this.prisma.translation.upsert({
      where: {
        entityType_entityId_field_lang: {
          entityType: item.entityType,
          entityId: item.entityId,
          field: item.field,
          lang: item.lang,
        },
      },
      create: item,
      update: { value: item.value },
    });
  }

  findForEntity(entityType: string, entityId: string, lang?: string): Promise<Translation[]> {
    return this.prisma.translation.findMany({
      where: { entityType, entityId, ...(lang ? { lang } : {}) },
      orderBy: [{ field: 'asc' }, { lang: 'asc' }],
    });
  }

  /** Overlay translations onto a single entity object. */
  async applyToEntity<T extends Record<string, unknown>>(entity: T, entityType: string, lang: string): Promise<T> {
    const rows = await this.findForEntity(entityType, entity['id'] as string, lang);
    if (!rows.length) return entity;
    const overrides = Object.fromEntries(rows.map((r) => [r.field, r.value]));
    return { ...entity, ...overrides };
  }

  /** Overlay translations onto a list of entity objects in a single query. */
  async applyToEntities<T extends Record<string, unknown>>(entities: T[], entityType: string, lang: string): Promise<T[]> {
    if (!entities.length) return entities;
    const ids = entities.map((e) => e['id'] as string);
    const rows = await this.prisma.translation.findMany({
      where: { entityType, entityId: { in: ids }, lang },
    });

    const map = new Map<string, Record<string, string>>();
    for (const row of rows) {
      if (!map.has(row.entityId)) map.set(row.entityId, {});
      map.get(row.entityId)![row.field] = row.value;
    }

    return entities.map((entity) => {
      const overrides = map.get(entity['id'] as string);
      return overrides ? { ...entity, ...overrides } : entity;
    });
  }

  /** Convenience: apply translations only when lang is provided. Eliminates repetitive if-guards at call sites. */
  maybeApply<T extends Record<string, unknown>>(items: T[], entityType: string, lang?: string): Promise<T[]> {
    return lang ? this.applyToEntities(items, entityType, lang) : Promise.resolve(items);
  }

  /** Single-entity variant of maybeApply. */
  maybeApplyOne<T extends Record<string, unknown>>(entity: T, entityType: string, lang?: string): Promise<T> {
    return lang ? this.applyToEntity(entity, entityType, lang) : Promise.resolve(entity);
  }

  /** Bulk-fetch all translation rows for multiple entities (no lang filter). Use for admin read. */
  findForEntities(entityType: string, entityIds: string[]): Promise<Translation[]> {
    if (!entityIds.length) return Promise.resolve([]);
    return this.prisma.translation.findMany({ where: { entityType, entityId: { in: entityIds } } });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.translation.delete({ where: { id } });
  }

  async deleteForEntity(entityType: string, entityId: string): Promise<void> {
    await this.prisma.translation.deleteMany({ where: { entityType, entityId } });
  }
}
