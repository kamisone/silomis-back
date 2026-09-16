/**
 * The send-in service: embroidery on an item the customer already owns.
 *
 * The item comes by post, so most of what is fixed here is about the round
 * trip — what the shop can hoop, what it charges to handle and return, and
 * the states a parcel moves through. The design itself is priced by the same
 * stitch bands as a catalogue cap.
 */

/** The hidden catalogue product every send-in order is a line of. */
export const SEND_IN_PRODUCT_SLUG = 'send-in-embroidery';
/**
 * One position per side the customer may photograph. Three is the most
 * anyone embroiders on one item, and each is its own hooping, run and fee.
 */
export const SEND_IN_MAX_SIDES = 3;
export const SEND_IN_PLACEMENT_KEYS = ['side-1', 'side-2', 'side-3'] as const;
/** What a customer may call a side; the desk reads it off the parcel. */

export interface SendInItemType {
  key: string;
  sku: string;
  /** Handling and return postage, per item. */
  priceCents: number;
  /** Whether a frame here can take the height of foam. */
  allowPuff: boolean;
  maxChars: number;
  label: Record<string, string>;
}

/**
 * What can be posted in. Each type sets whether the frame can take 3D puff —
 * a jacket back can, a beanie's cuff cannot. The preview's scale is the side
 * position's own field, set on the position like any other.
 */
export const SEND_IN_ITEM_TYPES: SendInItemType[] = [
  { key: 'cap', sku: 'SENDIN-CAP', priceCents: 990, allowPuff: true, maxChars: 14, label: { en: 'Cap', fr: 'Casquette', es: 'Gorra', it: 'Cappellino', de: 'Kappe', nl: 'Pet', pl: 'Czapka z daszkiem' } },
  { key: 'beanie', sku: 'SENDIN-BEANIE', priceCents: 990, allowPuff: false, maxChars: 12, label: { en: 'Beanie', fr: 'Bonnet', es: 'Gorro', it: 'Berretto', de: 'Mütze', nl: 'Muts', pl: 'Czapka' } },
  { key: 'jacket', sku: 'SENDIN-JACKET', priceCents: 1490, allowPuff: true, maxChars: 24, label: { en: 'Jacket or hoodie', fr: 'Veste ou sweat', es: 'Chaqueta o sudadera', it: 'Giacca o felpa', de: 'Jacke oder Hoodie', nl: 'Jas of hoodie', pl: 'Kurtka lub bluza' } },
  { key: 'shirt', sku: 'SENDIN-SHIRT', priceCents: 1190, allowPuff: false, maxChars: 24, label: { en: 'Shirt or t-shirt', fr: 'Chemise ou t-shirt', es: 'Camisa o camiseta', it: 'Camicia o t-shirt', de: 'Hemd oder T-Shirt', nl: 'Overhemd of t-shirt', pl: 'Koszula lub t-shirt' } },
  { key: 'bag', sku: 'SENDIN-BAG', priceCents: 1290, allowPuff: true, maxChars: 20, label: { en: 'Bag', fr: 'Sac', es: 'Bolso', it: 'Borsa', de: 'Tasche', nl: 'Tas', pl: 'Torba' } },
  { key: 'other', sku: 'SENDIN-OTHER', priceCents: 1290, allowPuff: false, maxChars: 20, label: { en: 'Something else', fr: 'Autre chose', es: 'Otra cosa', it: 'Altro', de: 'Etwas anderes', nl: 'Iets anders', pl: 'Coś innego' } },
];

export const SEND_IN_ITEM_TYPE_KEYS = SEND_IN_ITEM_TYPES.map((t) => t.key);

export const SEND_IN_NOTE_MAX = 500;

/** Where the customer's own photographs live — private, signed on read. */
export const SEND_IN_PHOTO_PREFIX = 'send-in/';
export const SEND_IN_PHOTO_MAX = 3;
export const SEND_IN_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const SEND_IN_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/**
 * The parcel's round trip. Linear, with two exits: a problem the shop found
 * on the bench (wrong fabric, nothing to hoop) and a cancellation.
 */
export const SEND_IN_STATUSES = ['awaiting_item', 'received', 'in_production', 'done', 'returned', 'delivered', 'problem', 'cancelled'] as const;
export type SendInStatus = (typeof SEND_IN_STATUSES)[number];

export const SEND_IN_TRANSITIONS: Record<SendInStatus, SendInStatus[]> = {
  awaiting_item: ['received', 'cancelled'],
  received: ['in_production', 'problem', 'cancelled'],
  in_production: ['done', 'problem'],
  done: ['returned', 'problem'],
  returned: ['delivered'],
  delivered: [],
  problem: ['received', 'in_production', 'returned', 'cancelled'],
  cancelled: [],
};

/** Steps that must come with a photograph — the item as it arrived, and the finished piece. */
/**
 * The customer's own logo or drawing. Rendered to a bounded PNG for the
 * editor and the mockup; the original is kept for the digitiser.
 */
export const SEND_IN_ARTWORK_PREFIX = 'send-in/artwork/';
export const SEND_IN_ARTWORK_MAX_BYTES = 10 * 1024 * 1024;
export const SEND_IN_ARTWORK_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
/** Long side of the rendering — plenty for a screen, a mockup and a printout. */
export const SEND_IN_ARTWORK_MAX_PX = 2000;
/** How wide a logo may be stitched, in millimetres. */
export const SEND_IN_ARTWORK_MIN_MM = 10;
export const SEND_IN_ARTWORK_MAX_MM = 200;
/**
 * Fill density for the stitch estimate: a solid square centimetre of fill
 * is roughly 600 stitches, so 6 per mm² of drawn area. Only a size guard on
 * a send-in — the side's price is flat — but the machine's one-go limit is
 * still real.
 */
export const SEND_IN_ARTWORK_STITCHES_PER_MM2 = 6;
/**
 * The most a send-in side may need in one hooping. The catalogue's price
 * bands cap a design where the shop stops quoting; a side is priced flat, so
 * the only limit left is the machine's — and a 60mm filled logo is already
 * past the bands' top, which is nothing a multi-needle machine minds.
 */
export const SEND_IN_MAX_STITCHES = 25_000;

export const SEND_IN_PHOTO_REQUIRED: SendInStatus[] = ['received', 'done'];
