import { InitiateCheckoutSchema } from './checkout.dto';

const base = {
  cartToken: '11111111-1111-4111-8111-111111111111',
  email: 'a@b.fr',
  line1: '1 rue X',
  city: 'Paris',
  zip: '75001',
  country: 'FR',
};

describe('InitiateCheckoutSchema — name', () => {
  it('takes one name field, one word is enough', () => {
    expect(InitiateCheckoutSchema.safeParse({ ...base, name: 'Madonna' }).success).toBe(true);
  });

  it('still takes first + last from a form opened before the change', () => {
    expect(InitiateCheckoutSchema.safeParse({ ...base, firstName: 'Jean', lastName: 'Dupont' }).success).toBe(true);
  });

  it('refuses a missing or one-letter name, unless a company stands in', () => {
    expect(InitiateCheckoutSchema.safeParse({ ...base, name: 'A' }).success).toBe(false);
    expect(InitiateCheckoutSchema.safeParse({ ...base }).success).toBe(false);
    expect(InitiateCheckoutSchema.safeParse({ ...base, companyName: 'Acme' }).success).toBe(true);
  });
});
