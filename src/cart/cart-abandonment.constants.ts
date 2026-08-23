export const CART_ABANDONMENT_QUEUE = 'shop-cart-abandonment';

export interface CartAbandonmentJobData {
  cartToken: string;
}
