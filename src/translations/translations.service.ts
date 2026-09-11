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

  /**
   * Applies translations whose field is a composite `prefix:id:property` key —
   * the form the admin UI writes for anything inside a JSON collection
   * ("faq:abc:question", "infoSection:def:label").
   *
   * applyToEntities only merges flat fields, so those keys landed on the
   * entity as junk properties literally named "faq:abc:question" while the
   * FAQ itself stayed in the base language. The admin has been storing these
   * translations all along; nothing read them.
   *
   * `collections` maps each prefix to the entity property holding the array,
   * e.g. `{ faq: 'faqs' }`. Items are matched on their `id`. Mutates in place,
   * because the caller has already resolved URLs and prices onto the same
   * object graph.
   */
  applyNestedInPlace(entity: Record<string, unknown>, collections: Record<string, string>): void {
    for (const key of Object.keys(entity)) {
      const parts = key.split(':');
      if (parts.length !== 3) continue;

      const [prefix, itemId, property] = parts;
      const arrayField = collections[prefix];
      // Always remove the composite key, even when it targets a collection
      // this entity does not carry: it is an implementation detail of the
      // translation table and has no business in a public payload.
      const value = entity[key];
      delete entity[key];
      if (!arrayField || typeof value !== 'string') continue;

      const items = entity[arrayField];
      if (!Array.isArray(items)) continue;

      const item = items.find((i): i is Record<string, unknown> => !!i && typeof i === 'object' && (i as Record<string, unknown>).id === itemId);
      if (item) item[property] = value;
    }
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
