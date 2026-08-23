// ── Commerce Domain Event Names ─────────────────────────────────────────
// All inter-module side effects (emails, payouts, search indexing,
// analytics) react to these events. Modules must NOT call each other
// directly — emit here, subscribe elsewhere.

export const COMMERCE_EVENTS = {
  // Orders
  ORDER_CREATED: 'commerce.order.created',
  ORDER_STATUS_CHANGED: 'commerce.order.status.changed',
  ORDER_CANCELLED: 'commerce.order.cancelled',

  // Payments
  PAYMENT_SUCCEEDED: 'commerce.payment.succeeded',
  PAYMENT_FAILED: 'commerce.payment.failed',

  // Inventory
  INVENTORY_RESERVED: 'commerce.inventory.reserved',
  INVENTORY_RELEASED: 'commerce.inventory.released',
  INVENTORY_RESTOCKED: 'commerce.inventory.restocked',
  INVENTORY_LOW_STOCK: 'commerce.inventory.low_stock',

  // Catalog
  PRODUCT_PUBLISHED: 'commerce.product.published',
  PRODUCT_UPDATED: 'commerce.product.updated',
  PRODUCT_ARCHIVED: 'commerce.product.archived',

  // Engagement
  CART_ABANDONED: 'commerce.cart.abandoned',
  REVIEW_SUBMITTED: 'commerce.review.submitted',
  WISHLIST_CREATED: 'commerce.wishlist.created',
} as const;

export type CommerceEventName = (typeof COMMERCE_EVENTS)[keyof typeof COMMERCE_EVENTS];

// ── Event payload types ─────────────────────────────────────────────────

export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  totalCents: number;
  vendorIds: string[];
}

export interface OrderStatusChangedEvent {
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  triggeredBy: 'system' | 'admin' | 'webhook';
}

export interface PaymentSucceededEvent {
  orderId: string;
  paymentIntentId: string;
  amountCents: number;
}

export interface PaymentFailedEvent {
  orderId: string;
  paymentIntentId: string;
}

export interface InventoryReservedEvent {
  variantId: string;
  orderId: string;
  quantity: number;
}

export interface InventoryReleasedEvent {
  variantId: string;
  orderId: string;
  quantity: number;
}

export interface InventoryRestockedEvent {
  productId: string;
  variantId: string;
  newAvailable: number;
}

export interface InventoryLowStockEvent {
  productId: string;
  variantId: string;
  available: number;
  lowStockThreshold: number;
}

export interface ProductPublishedEvent {
  productId: string;
  slug: string;
}

export interface ProductUpdatedEvent {
  productId: string;
}

export interface CartAbandonedEvent {
  cartToken: string;
  customerEmail: string | null;
  customerName: string | null;
}

export interface ReviewSubmittedEvent {
  reviewId: string;
  productId: string;
  orderId: string | null;
  userId: string | null;
  rating: number;
}
