import {
  intlLocale,
  type CalendarPreference,
  type DigitStyle,
  type Locale,
} from './locales';

export interface FormatPrefs {
  locale: Locale;
  digits?: DigitStyle;
  calendar?: CalendarPreference;
}

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(tag: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${tag}|${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(tag, options);
    cache.set(key, f);
  }
  return f;
}

function dateFormat(tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${tag}|${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(tag, options);
    cache.set(key, f);
  }
  return f;
}

/**
 * Format an amount in halalas as SAR, with locale-correct symbol placement:
 * ar → "١٢٣٫٤٥ ر.س.‏" (or Latin digits per preference), en → "SAR 123.45".
 */
export function formatPrice(halalas: number, prefs: FormatPrefs): string {
  if (!Number.isSafeInteger(halalas)) throw new TypeError(`halalas must be an integer: ${halalas}`);
  const tag = intlLocale(prefs.locale, { digits: prefs.digits });
  return numberFormat(tag, {
    style: 'currency',
    currency: 'SAR',
    currencyDisplay: prefs.locale === 'ar' ? 'symbol' : 'code',
    minimumFractionDigits: halalas % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(halalas / 100)
    .replace(/ /g, ' ');
}

export function formatNumber(value: number, prefs: FormatPrefs, options: Intl.NumberFormatOptions = {}): string {
  return numberFormat(intlLocale(prefs.locale, { digits: prefs.digits }), options).format(value);
}

export function formatDate(
  date: Date | string | number,
  prefs: FormatPrefs,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${String(date)}`);
  const tag = intlLocale(prefs.locale, { digits: prefs.digits, calendar: prefs.calendar });
  return dateFormat(tag, { timeZone: 'Asia/Riyadh', ...options }).format(d);
}

/** Gregorian date with the Hijri (Umm al-Qura) equivalent, e.g. for invoices and bookings. */
export function formatDualDate(date: Date | string | number, prefs: Omit<FormatPrefs, 'calendar'>): string {
  const g = formatDate(date, { ...prefs, calendar: 'gregory' });
  const h = formatDate(date, { ...prefs, calendar: 'islamic_umalqura' });
  return `${g} (${h})`;
}

/** Format a measurement held in millimetres as cm (or inches for users who chose inches). */
export function formatLength(mm: number, unit: 'cm' | 'in', prefs: FormatPrefs): string {
  const value = unit === 'cm' ? mm / 10 : mm / 25.4;
  return formatNumber(value, prefs, { style: 'unit', unit: unit === 'cm' ? 'centimeter' : 'inch', maximumFractionDigits: 1 });
}
