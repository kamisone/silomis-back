import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORT_SETTINGS_KEYS, SUPPORT_DEFAULTS } from './support.constants';

export interface SupportNotificationSettings {
  smsEnabled: boolean;
  smsPhones: string[];
  smsCooldownMin: number;
  inactiveCloseHours: number;
}

@Injectable()
export class SupportNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SupportNotificationSettings> {
    const keys = Object.values(SUPPORT_SETTINGS_KEYS);
    const rows = await this.prisma.platformSettings.findMany({
      where: { key: { in: [...keys] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return {
      smsEnabled: (map[SUPPORT_SETTINGS_KEYS.smsEnabled] ?? 'false') === 'true',
      smsPhones: JSON.parse(map[SUPPORT_SETTINGS_KEYS.smsPhones] ?? '[]'),
      smsCooldownMin: parseInt(
        map[SUPPORT_SETTINGS_KEYS.smsCooldownMin] ??
          String(SUPPORT_DEFAULTS.smsCooldownMin),
        10,
      ),
      inactiveCloseHours: parseInt(
        map[SUPPORT_SETTINGS_KEYS.inactiveCloseHours] ??
          String(SUPPORT_DEFAULTS.inactiveCloseHours),
        10,
      ),
    };
  }

  async updateSettings(
    patch: Partial<SupportNotificationSettings>,
  ): Promise<SupportNotificationSettings> {
    const updates: { key: string; value: string }[] = [];

    if (patch.smsEnabled !== undefined)
      updates.push({
        key: SUPPORT_SETTINGS_KEYS.smsEnabled,
        value: String(patch.smsEnabled),
      });
    if (patch.smsPhones !== undefined)
      updates.push({
        key: SUPPORT_SETTINGS_KEYS.smsPhones,
        value: JSON.stringify(patch.smsPhones),
      });
    if (patch.smsCooldownMin !== undefined)
      updates.push({
        key: SUPPORT_SETTINGS_KEYS.smsCooldownMin,
        value: String(patch.smsCooldownMin),
      });
    if (patch.inactiveCloseHours !== undefined)
      updates.push({
        key: SUPPORT_SETTINGS_KEYS.inactiveCloseHours,
        value: String(patch.inactiveCloseHours),
      });

    await Promise.all(
      updates.map(({ key, value }) =>
        this.prisma.platformSettings.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );

    return this.getSettings();
  }
}
