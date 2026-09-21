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
 * Events added after this page shipped, each with the marker for its one-time
 * backfill.
 *
 * An install that has already saved an event selection has a row that predates
 * the new event, so without a backfill the addition reads as "these alerts
 * turned themselves off" — which is how support alerts would have gone silent
 * when they moved here from their own switch in the support panel. Each entry
 * runs once; the marker means a later untick is never undone.
 *
 * Add a row here with every new event that should be ON for installs already
 * in service.
 */
export const ADMIN_NOTIF_BACKFILLS = [
  { event: 'support_message', markerKey: 'admin_notif_support_event_backfilled' },
  { event: 'order_message', markerKey: 'admin_notif_order_message_backfilled' },
] as const;

export const ADMIN_NOTIF_EVENTS = [
  'payment_succeeded',
  'payment_failed',
  'order_cancelled',
  'order_shipped',
  'order_delivered',
  'low_stock',
  'support_message',
  'order_message',
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
 * Events default to the five a customer triggers on their own — paying, a
 * payment failing, cancelling, opening a support chat, and writing on their
 * order. Shipped/delivered fire on the admin's own click and low stock can be
 * noisy, so those are opt-in.
 */
export const ADMIN_NOTIF_DEFAULTS: AdminNotifSettings = {
  smsEnabled: true,
  smsPhones: [],
  emailEnabled: true,
  emailAddresses: [],
  events: [
    'payment_succeeded',
    'payment_failed',
    'order_cancelled',
    'support_message',
    'order_message',
  ],
};
