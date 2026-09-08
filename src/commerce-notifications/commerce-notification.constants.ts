/**
 * Admin-notification settings, mirroring the reference project's
 * commerce-notification constants.
 *
 * The platform_settings key names keep silomis's own `admin_notif_*` prefix
 * rather than the reference project's `commerce_notif_*`: `admin_notif_events`
 * already holds live data on deployed installs, and renaming it would silently
 * reset every admin's event selection. Only the shape is shared.
 */
export const ADMIN_NOTIF_KEYS = {
  smsEnabled: 'admin_notif_sms_enabled',
  smsPhones: 'admin_notif_sms_phones',
  emailEnabled: 'admin_notif_email_enabled',
  emailAddresses: 'admin_notif_email_addresses',
  events: 'admin_notif_events',
} as const;

/**
 * Marks the one-time backfill that added `support_message` to an events row
 * written before that event existed. Without it, moving support alerts onto
 * this page would silently switch them off for anyone who had already saved
 * their event selection.
 */
export const ADMIN_NOTIF_SUPPORT_BACKFILL_KEY = 'admin_notif_support_event_backfilled';

export const ADMIN_NOTIF_EVENTS = [
  'payment_succeeded',
  'payment_failed',
  'order_cancelled',
  'order_shipped',
  'order_delivered',
  'low_stock',
  'support_message',
] as const;

export type AdminNotifEvent = (typeof ADMIN_NOTIF_EVENTS)[number];

export interface AdminNotifSettings {
  smsEnabled: boolean;
  smsPhones: string[];
  emailEnabled: boolean;
  emailAddresses: string[];
  events: AdminNotifEvent[];
}

/**
 * What an install that has never opened Shop → Settings → Notifications gets.
 *
 * Both channels start ON and both recipient lists start EMPTY, which means
 * "every admin account" (see resolveRecipients). That is exactly what silomis
 * did before the recipient lists existed, so upgrading changes nothing until
 * somebody deliberately narrows the list.
 *
 * Events default to the four a customer triggers on their own — paying, a
 * payment failing, cancelling, and opening a support chat. Shipped/delivered
 * fire on the admin's own click and low stock can be noisy, so those are
 * opt-in.
 */
export const ADMIN_NOTIF_DEFAULTS: AdminNotifSettings = {
  smsEnabled: true,
  smsPhones: [],
  emailEnabled: true,
  emailAddresses: [],
  events: ['payment_succeeded', 'payment_failed', 'order_cancelled', 'support_message'],
};
