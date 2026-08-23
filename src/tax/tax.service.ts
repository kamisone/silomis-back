import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxRateDto, UpdateTaxRateDto } from './dto/tax-rate.dto';

const DEFAULT_RATE_PCT = 20;
const DEFAULT_LABEL = 'VAT';
const DEFAULT_COUNTRY_FALLBACK = 'FR';

@Injectable()
export class TaxService implements OnModuleInit {
  private readonly logger = new Logger(TaxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  /** Idempotent: only runs when no global default row exists yet — preserves the 20% rate that was previously hardcoded, so this ships with zero regression. */
  private async seed(): Promise<void> {
    const existing = await this.prisma.taxRate.findFirst({ where: { countryCode: null, categoryId: null } });
    if (existing) return;
    await this.prisma.taxRate.create({ data: { countryCode: null, categoryId: null, ratePct: DEFAULT_RATE_PCT, label: DEFAULT_LABEL, isActive: true } });
    this.logger.log(`Seeded default tax rate (${DEFAULT_RATE_PCT}% ${DEFAULT_LABEL})`);
  }

  // ── Admin CRUD ───────────────────────────────────────────────────────────

  async list() {
    return this.prisma.taxRate.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ countryCode: 'asc' }, { categoryId: 'asc' }],
    });
  }

  async findOne(id: string) {
    const rate = await this.prisma.taxRate.findUnique({ where: { id }, include: { category: { select: { id: true, name: true } } } });
    if (!rate) throw new NotFoundException('Tax rate not found');
    return rate;
  }

  async create(dto: CreateTaxRateDto) {
    await this.assertComboAvailable(dto.countryCode ?? null, dto.categoryId ?? null, null);
    return this.prisma.taxRate.create({
      data: {
        countryCode: dto.countryCode ?? null,
        categoryId: dto.categoryId ?? null,
        ratePct: dto.ratePct,
        label: dto.label ?? DEFAULT_LABEL,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateTaxRateDto) {
    const existing = await this.findOne(id);
    const countryCode = dto.countryCode !== undefined ? dto.countryCode : existing.countryCode;
    const categoryId = dto.categoryId !== undefined ? dto.categoryId : existing.categoryId;
    if (dto.countryCode !== undefined || dto.categoryId !== undefined) {
      await this.assertComboAvailable(countryCode, categoryId, id);
    }

    return this.prisma.taxRate.update({
      where: { id },
      data: {
        ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.ratePct !== undefined ? { ratePct: dto.ratePct } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (existing.countryCode === null && existing.categoryId === null) {
      throw new ConflictException('The global default tax rate cannot be deleted — update it instead');
    }
    await this.prisma.taxRate.delete({ where: { id } });
  }

  // ── Resolution ───────────────────────────────────────────────────────────
  // Precedence: category+country > category-only > country-only > global default.

  async resolveRate(countryCode: string | null, categoryId: string | null): Promise<{ ratePct: number; label: string; country: string }> {
    const candidates = await this.prisma.taxRate.findMany({
      where: {
        isActive: true,
        OR: [countryCode && categoryId ? { countryCode, categoryId } : undefined, categoryId ? { countryCode: null, categoryId } : undefined, countryCode ? { countryCode, categoryId: null } : undefined, { countryCode: null, categoryId: null }].filter(Boolean) as Array<{ countryCode: string | null; categoryId: string | null }>,
      },
    });

    const byCountryAndCategory = candidates.find((r) => r.countryCode === countryCode && r.categoryId === categoryId && countryCode && categoryId);
    const byCategory = candidates.find((r) => r.categoryId === categoryId && r.countryCode === null && categoryId);
    const byCountry = candidates.find((r) => r.countryCode === countryCode && r.categoryId === null && countryCode);
    const byDefault = candidates.find((r) => r.countryCode === null && r.categoryId === null);

    const match = byCountryAndCategory ?? byCategory ?? byCountry ?? byDefault;
    return { ratePct: match ? Number(match.ratePct) : DEFAULT_RATE_PCT, label: match?.label ?? DEFAULT_LABEL, country: countryCode ?? DEFAULT_COUNTRY_FALLBACK };
  }

  // ── Validation ───────────────────────────────────────────────────────────

  private async assertComboAvailable(countryCode: string | null, categoryId: string | null, excludeId: string | null): Promise<void> {
    const existing = await this.prisma.taxRate.findFirst({ where: { countryCode, categoryId, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException('A tax rate for this country/category combination already exists');
  }
}
