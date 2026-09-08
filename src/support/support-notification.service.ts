import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORT_SETTINGS_KEYS, SUPPORT_DEFAULTS } from './support.constants';

export interface SupportNotificationSettings {
  smsCooldownMin: number;
  inactiveCloseHours: number;
}

/**
 * Support's own behaviour knobs. Channels and recipients are not here — a
 * support alert goes out through CommerceNotificationService under the
 * `support_message` event, alongside every other admin alert.
 */
@Injectable()
export class SupportNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SupportNotificationSettings> {
    const rows = await this.prisma.platformSettings.findMany({
      where: { key: { in: Object.values(SUPPORT_SETTINGS_KEYS) } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const int = (key: string, fallback: number) => {
      const parsed = parseInt(map[key] ?? '', 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    return {
      smsCooldownMin: int(SUPPORT_SETTINGS_KEYS.smsCooldownMin, SUPPORT_DEFAULTS.smsCooldownMin),
      inactiveCloseHours: int(SUPPORT_SETTINGS_KEYS.inactiveCloseHours, SUPPORT_DEFAULTS.inactiveCloseHours),
    };
  }

  async updateSettings(patch: Partial<SupportNotificationSettings>): Promise<SupportNotificationSettings> {
    const writes: { key: string; value: string }[] = [];
    if (patch.smsCooldownMin !== undefined) writes.push({ key: SUPPORT_SETTINGS_KEYS.smsCooldownMin, value: String(patch.smsCooldownMin) });
    if (patch.inactiveCloseHours !== undefined) writes.push({ key: SUPPORT_SETTINGS_KEYS.inactiveCloseHours, value: String(patch.inactiveCloseHours) });

    for (const { key, value } of writes) {
      await this.prisma.platformSettings.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    return this.getSettings();
  }
}
