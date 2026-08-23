import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationsService } from '../translations/translations.service';
import { COUNTRY_SEED } from './country-seed.data';
import { Country } from '../../generated/prisma/client';

const ET_SHOP_COUNTRY = 'shop_country';

@Injectable()
export class CountriesService implements OnModuleInit {
  private readonly logger = new Logger(CountriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    for (const { nameEn, ...data } of COUNTRY_SEED) {
      const exists = await this.prisma.country.findUnique({ where: { isoCode: data.isoCode } });
      if (exists) continue;

      await this.prisma.country.create({ data: { ...data, isActive: true } });
      await this.translations.upsert({ entityType: ET_SHOP_COUNTRY, entityId: data.isoCode, field: 'name', lang: 'en', value: nameEn });
    }
    this.logger.log('Country reference table seeded');
  }

  // Country's PK is isoCode, not id — TranslationsService keys off entity.id,
  // so map isoCode -> id before applying the overlay.
  async listActive(lang?: string): Promise<Country[]> {
    const countries = await this.prisma.country.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const withId = countries.map((c) => ({ ...c, id: c.isoCode }));
    return this.translations.maybeApply(withId, ET_SHOP_COUNTRY, lang) as Promise<Country[]>;
  }

  listAll(): Promise<Country[]> {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: Partial<Country> & { isoCode: string; name: string }): Promise<Country> {
    return this.prisma.country.create({
      data: { isActive: true, isShippingEnabled: false, isEuVat: false, ...dto },
    });
  }

  patch(isoCode: string, dto: Partial<Omit<Country, 'isoCode'>>): Promise<Country> {
    return this.prisma.country.update({ where: { isoCode }, data: dto });
  }

  async remove(isoCode: string): Promise<void> {
    await this.prisma.country.delete({ where: { isoCode } });
  }
}
