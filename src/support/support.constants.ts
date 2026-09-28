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

/**
 * How long the shop's reply waits before it becomes an email.
 *
 * Not zero. A customer reading the thread when the answer arrives sees it on
 * screen, and an email about a message they are already looking at is noise —
 * so the job is delayed and cancels itself if the message has been read by the
 * time it runs. Short enough that someone who has closed the tab is not left
 * wondering.
 */
export const GUEST_NOTIFY_DELAY_MS = 2 * 60_000;

/**
 * And at most one such email per conversation in this window, so a shop
 * sending three lines in a row sends one email, not three.
 */
export const GUEST_NOTIFY_COOLDOWN_MS = 15 * 60_000;

export const MAX_MESSAGE_LENGTH = 2000;
export const WS_RATE_LIMIT_COUNT = 5;
export const WS_RATE_LIMIT_WINDOW = 10_000; // ms
export const GUEST_WS_TICKET_TTL = '2m';
export const MSG_ACK_TIMEOUT_MS = 8_000;
