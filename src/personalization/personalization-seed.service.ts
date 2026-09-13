import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CAP_PLACEMENT_SEED,
  DEFAULT_TEMPLATE_KEY,
  DEFAULT_TEMPLATE_NAME,
  FONT_SEED,
  PRICE_BAND_SEED,
  THREAD_BRAND,
  THREAD_SEED,
} from './personalization.seed';

/** One marker per catalogue, holding the keys this build has ever inserted. */
const SEEDED_FONTS_KEY = 'personalization_seeded_font_keys';
const SEEDED_THREADS_KEY = 'personalization_seeded_thread_codes';
const SEEDED_TEMPLATE_KEY = 'personalization_seeded_template_keys';

/**
 * Puts the starting catalogue in place on boot, then stays out of the way.
 *
 * Same contract as the country seed, and for the same reason: a shop that
 * retires a thread or a face must not find it back on the wall after the next
 * deploy. The marker records what has ever been inserted, so a row deleted in
 * the admin stays deleted, while a genuinely new entry added to the seed file
 * still lands on the next boot.
 */
@Injectable()
export class PersonalizationSeedService implements OnModuleInit {
  private readonly logger = new Logger(PersonalizationSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      // A seed failure must never stop the API from booting — the editor
      // simply reports "not available" until someone looks at this log.
      this.logger.error(`Personalization seed failed: ${(err as Error).message}`);
    }
  }

  async seed(): Promise<void> {
    await this.seedFonts();
    await this.seedThreads();
    await this.seedTemplate();
  }

  // ── Fonts ────────────────────────────────────────────────────────────

  private async seedFonts(): Promise<void> {
    const seeded = await this.readMarker(SEEDED_FONTS_KEY);
    const fresh = seeded === null && (await this.prisma.embroideryFont.count()) === 0;
    const already = new Set(seeded ?? (fresh ? [] : FONT_SEED.map((f) => f.key)));

    const pending = FONT_SEED.filter((f) => !already.has(f.key));
    if (pending.length) {
      await this.prisma.embroideryFont.createMany({ data: pending, skipDuplicates: true });
      this.logger.log(`Seeded ${pending.length} embroidery font(s)`);
    }
    await this.writeMarker(SEEDED_FONTS_KEY, [...already, ...pending.map((f) => f.key)]);
  }

  // ── Threads ──────────────────────────────────────────────────────────

  private async seedThreads(): Promise<void> {
    const seeded = await this.readMarker(SEEDED_THREADS_KEY);
    const fresh = seeded === null && (await this.prisma.threadColor.count()) === 0;
    const already = new Set(seeded ?? (fresh ? [] : THREAD_SEED.map((t) => t.code)));

    const pending = THREAD_SEED.filter((t) => !already.has(t.code));
    if (pending.length) {
      await this.prisma.threadColor.createMany({
        data: pending.map((t) => ({ ...t, brand: THREAD_BRAND })),
        skipDuplicates: true,
      });
      this.logger.log(`Seeded ${pending.length} thread colour(s)`);
    }
    await this.writeMarker(SEEDED_THREADS_KEY, [...already, ...pending.map((t) => t.code)]);
  }

  // ── Template, placements and bands ───────────────────────────────────

  /**
   * The template is seeded once and then left alone entirely — its placements
   * carry hoop measurements and preview coordinates that a shop is expected to
   * tune against its own photography, and re-running the seed over edited
   * numbers would undo that work on every deploy.
   */
  private async seedTemplate(): Promise<void> {
    const seeded = await this.readMarker(SEEDED_TEMPLATE_KEY);
    const fresh = seeded === null && (await this.prisma.personalizationTemplate.count()) === 0;
    const already = new Set(seeded ?? (fresh ? [] : [DEFAULT_TEMPLATE_KEY]));
    if (already.has(DEFAULT_TEMPLATE_KEY)) return;

    await this.prisma.personalizationTemplate.create({
      data: {
        key: DEFAULT_TEMPLATE_KEY,
        name: DEFAULT_TEMPLATE_NAME,
        allowText: true,
        allowMonogram: true,
        allowUpload: false,
        placements: { create: CAP_PLACEMENT_SEED },
        priceBands: { create: PRICE_BAND_SEED },
      },
    });
    this.logger.log(`Seeded personalization template "${DEFAULT_TEMPLATE_KEY}"`);

    await this.writeMarker(SEEDED_TEMPLATE_KEY, [...already, DEFAULT_TEMPLATE_KEY]);
  }

  // ── Marker storage ───────────────────────────────────────────────────

  private async readMarker(key: string): Promise<string[] | null> {
    const row = await this.prisma.platformSettings.findUnique({ where: { key } });
    if (!row) return null;
    return row.value.split(',').map((v) => v.trim()).filter(Boolean);
  }

  private async writeMarker(key: string, values: string[]): Promise<void> {
    const value = [...new Set(values)].sort().join(',');
    await this.prisma.platformSettings.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}
