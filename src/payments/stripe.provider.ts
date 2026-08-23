import Stripe = require('stripe');

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const stripeProvider = {
  provide: STRIPE_CLIENT,
  useFactory: () =>
    new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2026-07-29.dahlia',
    }),
};
