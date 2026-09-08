import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationsService } from '../translations/translations.service';
import { COUNTRY_SEED } from './country-seed.data';
import { Country } from '../../generated/prisma/client';

const ET_SHOP_COUNTRY = 'shop_country';
/** Which COUNTRY_SEED codes have ever been inserted — see seed(). */
const SEEDED_CODES_KEY = 'countries_seeded_iso_codes';

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

  /**
   * Creates each seed country exactly once, ever.
   *
   * The previous version skipped a country only while its row existed, so a
   * country the admin deleted in Shop → Countries came back on the next boot
   * (a restart, a redeploy, a new replica). What has already been seeded is
   * therefore recorded in platform_settings and never re-created, which still
   * leaves room to extend COUNTRY_SEED later: a code newly added to the file
   * is not in the marker yet, so it is inserted on the next boot.
   *
   * Installs that predate the marker are backfilled as "everything already
   * seeded" so an upgrade never resurrects a deletion made before this fix —
   * except on a genuinely empty table, which is a fresh install to seed.
   */
  async seed(): Promise<void> {
    const seeded = await this.readSeededCodes();
    const isFreshInstall = seeded === null && (await this.prisma.country.count()) === 0;
    const alreadySeeded = new Set(seeded ?? (isFreshInstall ? [] : COUNTRY_SEED.map((c) => c.isoCode)));

    const pending = COUNTRY_SEED.filter((c) => !alreadySeeded.has(c.isoCode));
    if (pending.length > 0) {
      // skipDuplicates: several replicas can boot at once, and a row the admin
      // added by hand under a seeded code must not be overwritten either.
      await this.prisma.country.createMany({
        data: pending.map((c) => ({ isoCode: c.isoCode, name: c.name, phonePrefix: c.phonePrefix, currencyCode: c.currencyCode, isoCode3: c.isoCode3, continentCode: c.continentCode, isEuVat: c.isEuVat, isShippingEnabled: c.isShippingEnabled, isActive: true })),
        skipDuplicates: true,
      });
      for (const { isoCode, nameEn } of pending) {
        await this.translations.upsert({ entityType: ET_SHOP_COUNTRY, entityId: isoCode, field: 'name', lang: 'en', value: nameEn });
      }
    }

    await this.writeSeededCodes([...alreadySeeded, ...pending.map((c) => c.isoCode)]);
    this.logger.log(`Country reference table seeded (${pending.length} added)`);
  }

  private async readSeededCodes(): Promise<string[] | null> {
    const row = await this.prisma.platformSettings.findUnique({ where: { key: SEEDED_CODES_KEY } });
    if (!row) return null;
    return row.value.split(',').map((c) => c.trim()).filter(Boolean);
  }

  private async writeSeededCodes(codes: string[]): Promise<void> {
    const value = [...new Set(codes)].sort().join(',');
    await this.prisma.platformSettings.upsert({
      where: { key: SEEDED_CODES_KEY },
      create: { key: SEEDED_CODES_KEY, value },
      update: { value },
    });
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
