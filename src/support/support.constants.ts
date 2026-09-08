export const SUPPORT_QUEUE = 'support-notification';

export const SUPPORT_SETTINGS_KEYS = {
  smsEnabled: 'support_sms_enabled',
  smsPhones: 'support_sms_phones',
  smsCooldownMin: 'support_sms_cooldown_minutes',
  inactiveCloseHours: 'support_inactive_close_hours',
} as const;

/**
 * The reference project ships smsEnabled=false with an empty phone list, which
 * means a fresh install silently logs "skipped" for every guest message until
 * somebody opens the notification modal in Shop → Support. Silomis turns SMS on
 * by default and treats an EMPTY phone list as "every admin account that has a
 * phone on file" — the same rule the commerce admin notifications use — so the
 * first customer to open the chat widget actually reaches someone.
 */
export const SUPPORT_DEFAULTS = {
  smsEnabled: true,
  smsPhones: [] as string[],
  smsCooldownMin: 15,
  inactiveCloseHours: 72,
};

export const MAX_MESSAGE_LENGTH = 2000;
export const WS_RATE_LIMIT_COUNT = 5;
export const WS_RATE_LIMIT_WINDOW = 10_000; // ms
export const GUEST_WS_TICKET_TTL = '2m';
export const MSG_ACK_TIMEOUT_MS = 8_000;
