/**
 * Seed data for shop_countries.
 * ISO 3166-1 — focused on the platform's primary markets.
 * Extend as needed; adding a row never breaks existing data.
 *
 * `name` is the French display name (the site's base/default language — matches
 * every other translatable shop entity, where the untranslated column is French
 * and `?lang=en` overlays the English value from the translations table).
 * `nameEn` is only used to seed that English overlay the first time a row is
 * inserted; it is not a column on the entity itself. Rows that already exist
 * in the database are never touched by this file.
 */
export const COUNTRY_SEED: Array<{
  isoCode: string;
  name: string;
  nameEn: string;
  phonePrefix: string;
  currencyCode: string;
  isoCode3: string;
  continentCode: string;
  isEuVat: boolean;
  isShippingEnabled: boolean;
}> = [
  { isoCode: 'FR', name: 'France', nameEn: 'France', phonePrefix: '+33', currencyCode: 'EUR', isoCode3: 'FRA', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'MA', name: 'Maroc', nameEn: 'Morocco', phonePrefix: '+212', currencyCode: 'MAD', isoCode3: 'MAR', continentCode: 'AF', isEuVat: false, isShippingEnabled: true },
  { isoCode: 'BE', name: 'Belgique', nameEn: 'Belgium', phonePrefix: '+32', currencyCode: 'EUR', isoCode3: 'BEL', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'CH', name: 'Suisse', nameEn: 'Switzerland', phonePrefix: '+41', currencyCode: 'CHF', isoCode3: 'CHE', continentCode: 'EU', isEuVat: false, isShippingEnabled: true },
  { isoCode: 'DE', name: 'Allemagne', nameEn: 'Germany', phonePrefix: '+49', currencyCode: 'EUR', isoCode3: 'DEU', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'ES', name: 'Espagne', nameEn: 'Spain', phonePrefix: '+34', currencyCode: 'EUR', isoCode3: 'ESP', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'GB', name: 'Royaume-Uni', nameEn: 'United Kingdom', phonePrefix: '+44', currencyCode: 'GBP', isoCode3: 'GBR', continentCode: 'EU', isEuVat: false, isShippingEnabled: true },
  { isoCode: 'IT', name: 'Italie', nameEn: 'Italy', phonePrefix: '+39', currencyCode: 'EUR', isoCode3: 'ITA', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'NL', name: 'Pays-Bas', nameEn: 'Netherlands', phonePrefix: '+31', currencyCode: 'EUR', isoCode3: 'NLD', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'PT', name: 'Portugal', nameEn: 'Portugal', phonePrefix: '+351', currencyCode: 'EUR', isoCode3: 'PRT', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'LU', name: 'Luxembourg', nameEn: 'Luxembourg', phonePrefix: '+352', currencyCode: 'EUR', isoCode3: 'LUX', continentCode: 'EU', isEuVat: true, isShippingEnabled: true },
  { isoCode: 'DZ', name: 'Algérie', nameEn: 'Algeria', phonePrefix: '+213', currencyCode: 'DZD', isoCode3: 'DZA', continentCode: 'AF', isEuVat: false, isShippingEnabled: false },
  { isoCode: 'TN', name: 'Tunisie', nameEn: 'Tunisia', phonePrefix: '+216', currencyCode: 'TND', isoCode3: 'TUN', continentCode: 'AF', isEuVat: false, isShippingEnabled: false },
  { isoCode: 'US', name: 'États-Unis', nameEn: 'United States', phonePrefix: '+1', currencyCode: 'USD', isoCode3: 'USA', continentCode: 'NA', isEuVat: false, isShippingEnabled: false },
  { isoCode: 'CA', name: 'Canada', nameEn: 'Canada', phonePrefix: '+1', currencyCode: 'CAD', isoCode3: 'CAN', continentCode: 'NA', isEuVat: false, isShippingEnabled: false },
];
