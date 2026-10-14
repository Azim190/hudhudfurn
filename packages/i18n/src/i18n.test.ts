import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDualDate,
  formatLength,
  formatNumber,
  formatPrice,
} from './format';
import {
  directionOf,
  intlLocale,
  isLocale,
  negotiateLocale,
  pickLocalized,
} from './locales';
import { flattenKeys, getMessages, messages, translate } from './messages';

/** Remove bidi control marks that ICU inserts so assertions stay readable. */
const clean = (s: string) => s.replace(/[‎‏؜]/g, '');

describe('message catalogs', () => {
  const arKeys = flattenKeys(messages.ar).sort();
  const enKeys = flattenKeys(messages.en).sort();

  it('have identical key sets in Arabic and English', () => {
    expect(enKeys).toEqual(arKeys);
  });

  it('have no empty strings', () => {
    for (const locale of ['ar', 'en'] as const) {
      for (const key of flattenKeys(messages[locale])) {
        expect(translate(locale, key).trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('use the same placeholders in both languages', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of arKeys) {
      expect(placeholders(translate('en', key)), key).toEqual(placeholders(translate('ar', key)));
    }
  });

  it('getMessages returns the catalog for a locale', () => {
    expect(getMessages('en').nav.cart).toBe('Cart');
  });
});

describe('translate', () => {
  it('interpolates parameters', () => {
    expect(translate('en', 'footer.vatNumber', { number: '300000000000003' })).toBe(
      'VAT No.: 300000000000003',
    );
    expect(translate('ar', 'auth.resendIn', { seconds: 30 })).toBe('إعادة الإرسال خلال 30 ثانية');
  });

  it('leaves unknown placeholders and returns the key for missing entries', () => {
    expect(translate('en', 'footer.vatNumber')).toBe('VAT No.: {number}');
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
    expect(translate('en', 'auth')).toBe('auth');
  });
});

describe('locales', () => {
  it('knows directions', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });

  it('validates locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(5)).toBe(false);
  });

  it.each([
    [undefined, 'ar'],
    ['', 'ar'],
    ['en-US,en;q=0.9', 'en'],
    ['fr-FR,en;q=0.5,ar;q=0.8', 'ar'],
    ['fr,de', 'ar'],
    ['en;q=abc, ar', 'ar'],
  ])('negotiates %s → %s', (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it('builds Intl tags with digit and calendar extensions', () => {
    expect(intlLocale('ar')).toBe('ar-SA');
    expect(intlLocale('ar', { digits: 'western' })).toBe('ar-SA-u-nu-latn');
    expect(intlLocale('en', { digits: 'arabic_indic', calendar: 'islamic_umalqura' })).toBe(
      'en-SA-u-ca-islamic-umalqura-nu-arab',
    );
    expect(intlLocale('ar', { calendar: 'gregory' })).toBe('ar-SA-u-ca-gregory');
  });

  it('picks localized values with fallback', () => {
    expect(pickLocalized({ ar: 'ستارة', en: 'Curtain' }, 'en')).toBe('Curtain');
    expect(pickLocalized({ ar: 'ستارة', en: '' }, 'en')).toBe('ستارة');
    expect(pickLocalized({ ar: 'ستارة' }, 'ar')).toBe('ستارة');
    expect(pickLocalized({ ar: ' ', en: 'Curtain' }, 'ar')).toBe('Curtain');
    expect(pickLocalized({ ar: '', en: null }, 'ar')).toBe('');
    expect(pickLocalized(null, 'ar')).toBe('');
  });
});

describe('formatPrice', () => {
  it('formats Arabic with Arabic-Indic digits and the riyal symbol after the amount', () => {
    expect(clean(formatPrice(12345, { locale: 'ar' }))).toBe('١٢٣٫٤٥ ر.س.');
  });

  it('formats Arabic with Western digits on request', () => {
    expect(clean(formatPrice(12345, { locale: 'ar', digits: 'western' }))).toBe('123.45 ر.س.');
  });

  it('formats English with the SAR code before the amount', () => {
    expect(formatPrice(12345, { locale: 'en' })).toBe('SAR 123.45');
    expect(formatPrice(1234500, { locale: 'en' })).toBe('SAR 12,345');
  });

  it('drops decimals for whole riyals', () => {
    expect(formatPrice(15000, { locale: 'en' })).toBe('SAR 150');
  });

  it('rejects fractional halalas', () => {
    expect(() => formatPrice(1.5, { locale: 'en' })).toThrow(TypeError);
  });
});

describe('formatNumber, formatDate and formatLength', () => {
  const date = new Date('2026-03-20T12:00:00Z');

  it('formats numbers with the requested digits', () => {
    expect(formatNumber(1500, { locale: 'ar' })).toBe('١٬٥٠٠');
    expect(formatNumber(1500, { locale: 'ar', digits: 'western' })).toBe('1,500');
  });

  it('formats Gregorian dates in Riyadh time', () => {
    expect(formatDate(date, { locale: 'en', calendar: 'gregory' })).toBe('Mar 20, 2026');
    expect(formatDate('2026-03-20T22:30:00Z', { locale: 'en' }, { dateStyle: 'short' })).toBe(
      formatDate(new Date('2026-03-21T01:30:00+03:00'), { locale: 'en' }, { dateStyle: 'short' }),
    );
  });

  it('formats Hijri (Umm al-Qura) dates', () => {
    expect(formatDate(date, { locale: 'ar', digits: 'western', calendar: 'islamic_umalqura' })).toContain(
      '1447',
    );
  });

  it('formats dual Gregorian/Hijri dates', () => {
    const s = formatDualDate(date.getTime(), { locale: 'en' });
    expect(s).toMatch(/^Mar 20, 2026 \(.*1447.*\)$/);
  });

  it('rejects invalid dates', () => {
    expect(() => formatDate('not a date', { locale: 'en' })).toThrow(RangeError);
  });

  it('formats lengths stored in millimetres', () => {
    expect(formatLength(2455, 'cm', { locale: 'en' })).toBe('245.5 cm');
    expect(formatLength(254, 'in', { locale: 'en' })).toBe('10 in');
  });

  it('reuses cached formatters', () => {
    expect(formatPrice(100, { locale: 'en' })).toBe(formatPrice(100, { locale: 'en' }));
  });
});
