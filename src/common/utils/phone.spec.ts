import { isPlausiblePhone, samePhone, toE164 } from './phone';

describe('phone', () => {
  describe('isPlausiblePhone', () => {
    it.each(['06 12 34 56 78', '+33 6 12 34 56 78', '0033612345678', '(06) 12-34.56/78'])('accepts %s', (raw) => {
      expect(isPlausiblePhone(raw)).toBe(true);
    });

    it.each(['', '12345', 'call me', '06 12 34 ab 78', '+1234567890123456'])('rejects %s', (raw) => {
      expect(isPlausiblePhone(raw)).toBe(false);
    });
  });

  describe('toE164', () => {
    it('keeps an international number as it is, minus the spacing', () => {
      expect(toE164('+33 6 12 34 56 78')).toBe('+33612345678');
    });

    it('reads 00 as +', () => {
      expect(toE164('0033 6 12 34 56 78')).toBe('+33612345678');
    });

    it('places a national number with the country prefix, dropping the trunk 0', () => {
      expect(toE164('06 12 34 56 78', '+33')).toBe('+33612345678');
      expect(toE164('0612 345678', '+31')).toBe('+31612345678');
    });

    it('keeps the leading 0 of an Italian number', () => {
      expect(toE164('06 1234 5678', '+39')).toBe('+390612345678');
    });

    it('cannot place a national number without a prefix', () => {
      expect(toE164('06 12 34 56 78')).toBeNull();
      expect(toE164('06 12 34 56 78', 'nonsense')).toBeNull();
    });
  });

  describe('samePhone', () => {
    it('matches the national and international spellings of one number', () => {
      expect(samePhone('06 12 34 56 78', '+33612345678', '+33')).toBe(true);
      expect(samePhone('0033612345678', '+33612345678', '+33')).toBe(true);
    });

    it('does not match a different number, or nothing', () => {
      expect(samePhone('06 12 34 56 79', '+33612345678', '+33')).toBe(false);
      expect(samePhone('', '+33612345678', '+33')).toBe(false);
      expect(samePhone(null, null, '+33')).toBe(false);
    });
  });
});
