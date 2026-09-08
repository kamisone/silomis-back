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
      smsEnabled:
        (map[SUPPORT_SETTINGS_KEYS.smsEnabled] ??
          String(SUPPORT_DEFAULTS.smsEnabled)) === 'true',
      smsPhones: JSON.parse(
        map[SUPPORT_SETTINGS_KEYS.smsPhones] ??
          JSON.stringify(SUPPORT_DEFAULTS.smsPhones),
      ),
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
        value: JSON.stringify(this.normalizePhones(patch.smsPhones)),
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

  /**
   * The numbers a guest message actually pages, or an empty list when support
   * SMS is switched off.
   *
   * An empty configured list is not "nobody": it falls back to every admin
   * account with a phone on file, so a fresh install notifies someone before
   * anyone has opened the settings modal. Narrowing to specific numbers — an
   * on-call phone, say — is the opt-in.
   */
  async resolvePhones(): Promise<string[]> {
    const settings = await this.getSettings();
    if (!settings.smsEnabled) return [];
    if (settings.smsPhones.length > 0) return settings.smsPhones;

    const admins = await this.prisma.admin.findMany({ select: { phone: true } });
    return admins.map((a) => a.phone).filter((p): p is string => !!p);
  }

  /**
   * Stored as typed, minus spacing; `00` becomes `+` because the two dial the
   * same number but are different strings to the SMS gateway.
   */
  private normalizePhones(phones: string[]): string[] {
    const cleaned = phones
      .map((p) => p.replace(/[\s\-().]/g, '').replace(/^00/, '+'))
      .filter(Boolean);
    return [...new Set(cleaned)];
  }
}
