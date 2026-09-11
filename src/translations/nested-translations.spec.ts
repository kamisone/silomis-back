import { TranslationsService } from './translations.service';

/**
 * The product editor stores translations for anything inside a JSON collection
 * under a composite key — "faq:<id>:question". applyToEntities only merges flat
 * fields, so before this those keys landed on the product as junk properties
 * and the FAQ itself stayed in the base language.
 */
const COLLECTIONS = {
  faq: 'faqs',
  infoSection: 'infoSections',
  trustBadge: 'trustBadges',
};

function service() {
  return new TranslationsService(null as never);
}

describe('applyNestedInPlace', () => {
  it('writes a composite key into the matching item', () => {
    const product: Record<string, unknown> = {
      faqs: [{ id: 'f1', question: "What's the fit?", answer: 'True to size.' }],
      'faq:f1:question': 'Quelle est la coupe ?',
    };

    service().applyNestedInPlace(product, COLLECTIONS);

    expect((product.faqs as Array<Record<string, unknown>>)[0].question).toBe('Quelle est la coupe ?');
  });

  it('removes the composite key from the payload', () => {
    const product: Record<string, unknown> = { faqs: [{ id: 'f1', question: 'a' }], 'faq:f1:question': 'b' };

    service().applyNestedInPlace(product, COLLECTIONS);

    // It is an implementation detail of the translations table — a storefront
    // payload has no business carrying a field called "faq:f1:question".
    expect('faq:f1:question' in product).toBe(false);
  });

  it('leaves the base value on an item with no translation row', () => {
    const product: Record<string, unknown> = {
      faqs: [{ id: 'f1', question: 'translated?' }, { id: 'f2', question: 'untouched' }],
      'faq:f1:question': 'traduit',
    };

    service().applyNestedInPlace(product, COLLECTIONS);

    expect((product.faqs as Array<Record<string, unknown>>)[1].question).toBe('untouched');
  });

  it('handles every collection the editor writes, in one pass', () => {
    const product: Record<string, unknown> = {
      faqs: [{ id: 'f1', answer: 'en' }],
      infoSections: [{ id: 's1', label: 'en', value: 'en' }],
      trustBadges: [{ id: 'b1', title: 'en' }],
      'faq:f1:answer': 'fr',
      'infoSection:s1:label': 'étiquette',
      'infoSection:s1:value': 'valeur',
      'trustBadge:b1:title': 'titre',
    };

    service().applyNestedInPlace(product, COLLECTIONS);

    expect((product.faqs as Array<Record<string, unknown>>)[0].answer).toBe('fr');
    expect((product.infoSections as Array<Record<string, unknown>>)[0]).toMatchObject({ label: 'étiquette', value: 'valeur' });
    expect((product.trustBadges as Array<Record<string, unknown>>)[0].title).toBe('titre');
  });

  it('drops a key whose prefix is not mapped rather than leaking it', () => {
    const product: Record<string, unknown> = { faqs: [], 'mystery:x:field': 'value' };

    service().applyNestedInPlace(product, COLLECTIONS);

    expect('mystery:x:field' in product).toBe(false);
  });

  it('ignores a key pointing at an item that no longer exists', () => {
    // The FAQ was deleted but its translation rows were not — the payload must
    // not grow a phantom entry.
    const product: Record<string, unknown> = { faqs: [{ id: 'f1', question: 'a' }], 'faq:gone:question': 'b' };

    service().applyNestedInPlace(product, COLLECTIONS);

    expect(product.faqs).toHaveLength(1);
  });

  it('leaves ordinary flat fields alone', () => {
    const product: Record<string, unknown> = { title: 'Titre', faqs: [] };

    service().applyNestedInPlace(product, COLLECTIONS);

    expect(product.title).toBe('Titre');
  });

  it('does not choke on a collection the product does not carry', () => {
    const product: Record<string, unknown> = { 'infoSection:s1:label': 'x' };

    expect(() => service().applyNestedInPlace(product, COLLECTIONS)).not.toThrow();
  });
});
