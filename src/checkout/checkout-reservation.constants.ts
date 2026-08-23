export const CHECKOUT_RESERVATION_QUEUE = 'shop-checkout-reservation-expiry';
export const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface ReservationExpiryJobData {
  orderId: string;
}
