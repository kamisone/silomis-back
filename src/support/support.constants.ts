export const SUPPORT_QUEUE = 'support-notification';

/**
 * Which channels a support alert uses, and who it reaches, now live on
 * Shop → Settings → Notifications as the `support_message` event — the same
 * recipients every other admin alert uses. What is left here is support's own
 * behaviour: how often one conversation may page, and when an idle
 * conversation closes itself.
 */
export const SUPPORT_SETTINGS_KEYS = {
  smsCooldownMin: 'support_sms_cooldown_minutes',
  inactiveCloseHours: 'support_inactive_close_hours',
} as const;

export const SUPPORT_DEFAULTS = {
  /** One conversation pages at most this often, however chatty the guest is. */
  smsCooldownMin: 15,
  inactiveCloseHours: 72,
};

export const MAX_MESSAGE_LENGTH = 2000;
export const WS_RATE_LIMIT_COUNT = 5;
export const WS_RATE_LIMIT_WINDOW = 10_000; // ms
export const GUEST_WS_TICKET_TTL = '2m';
export const MSG_ACK_TIMEOUT_MS = 8_000;
