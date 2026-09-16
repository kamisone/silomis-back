export const CHECKOUT_RESERVATION_QUEUE = 'shop-checkout-reservation-expiry';
export const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15 minutes
/** How much longer a reservation is held while Stripe still says the payment is in flight. */
export const RESERVATION_GRACE_MS = 10 * 60 * 1000;

export interface ReservationExpiryJobData {
  orderId: string;
}
