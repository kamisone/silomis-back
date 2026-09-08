import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Admin } from '../../generated/prisma/client';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { UpdateMfaDto } from './dto/update-mfa.dto';

type PublicAdmin = Omit<Admin, 'password'>;

/**
 * Stored the way SmsService stores a recipient — no spacing, `00` rewritten to
 * `+` — because the device gateway polls `GET /sms?to=…` with an exact match on
 * the stored string. A number saved as "+33 6 12 34 56 78" would queue fine and
 * then never be picked up.
 *
 * A blank string clears the number rather than storing "".
 */
function normalizeAdminPhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  return cleaned || null;
}

@Injectable()
export class AdminsService implements OnModuleInit {
  private readonly logger = new Logger(AdminsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Seeds the first superadmin from ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_PHONE when the table is empty. */
  async onModuleInit(): Promise<void> {
    const count = await this.prisma.admin.count();
    if (count > 0) return;

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;

    await this.prisma.admin.create({
      data: {
        name: 'Admin',
        email,
        phone: process.env.ADMIN_PHONE ?? null,
        password: await bcrypt.hash(password, 10),
        role: 'superadmin',
      },
    });
    this.logger.log(`Seeded superadmin account for ${email}`);
  }

  findByEmail(email: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { email } });
  }

  findById(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }

  async findAll(): Promise<PublicAdmin[]> {
    const admins = await this.prisma.admin.findMany({ orderBy: { createdAt: 'asc' } });
    return admins.map(this.toPublic);
  }

  async create(dto: CreateAdminDto): Promise<PublicAdmin> {
    const existing = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException(`Email ${dto.email} is already taken`);

    const admin = await this.prisma.admin.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: normalizeAdminPhone(dto.phone) ?? null,
        password: await bcrypt.hash(dto.password, 10),
        role: dto.role ?? 'admin',
      },
    });
    return this.toPublic(admin);
  }

  async findOne(id: string): Promise<PublicAdmin> {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException(`Admin ${id} not found`);
    return this.toPublic(admin);
  }

  async patch(id: string, dto: UpdateAdminDto): Promise<PublicAdmin> {
    await this.assertExists(id);
    if (dto.email) {
      const taken = await this.prisma.admin.findUnique({ where: { email: dto.email } });
      if (taken && taken.id !== id) throw new ConflictException(`Email ${dto.email} is already taken`);
    }
    const admin = await this.prisma.admin.update({
      where: { id },
      // `phone` is deliberately not spread: undefined leaves the stored number
      // alone, while an explicit null or a blank string clears it.
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        ...(dto.phone === undefined ? {} : { phone: normalizeAdminPhone(dto.phone) }),
      },
    });
    return this.toPublic(admin);
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.assertExists(id);
    await this.prisma.admin.delete({ where: { id } });
    return { ok: true };
  }

  async updateMfa(id: string, dto: UpdateMfaDto): Promise<PublicAdmin> {
    await this.assertExists(id);
    const admin = await this.prisma.admin.update({
      where: { id },
      data: {
        mfaEnabled: dto.mfaEnabled,
        preferredMfaMethod: dto.preferredMfaMethod,
        phone: dto.phone === undefined ? undefined : normalizeAdminPhone(dto.phone),
      },
    });
    return this.toPublic(admin);
  }

  async resetPassword(id: string, dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.assertExists(id);
    await this.prisma.admin.update({
      where: { id },
      data: { password: await bcrypt.hash(dto.password, 10) },
    });
    return { ok: true };
  }

  private async assertExists(id: string): Promise<void> {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException(`Admin ${id} not found`);
  }

  private toPublic(admin: Admin): PublicAdmin {
    const { password: _password, ...rest } = admin;
    return rest;
  }
}
