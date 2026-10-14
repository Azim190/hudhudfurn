export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export type Direction = 'rtl' | 'ltr';
export type DigitStyle = 'western' | 'arabic_indic';
export type CalendarPreference = 'gregory' | 'islamic_umalqura';

export const LOCALE_META: Record<Locale, { dir: Direction; bcp47: string; nativeName: string }> = {
  ar: { dir: 'rtl', bcp47: 'ar-SA', nativeName: 'العربية' },
  en: { dir: 'ltr', bcp47: 'en-SA', nativeName: 'English' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): Direction {
  return LOCALE_META[locale].dir;
}

/** Pick the best supported locale from an Accept-Language header value. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { lang: tag.toLowerCase().split('-')[0] ?? '', q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  return ranked.map((r) => r.lang).find(isLocale) ?? DEFAULT_LOCALE;
}

/** Build a BCP-47 tag with Unicode extensions for digits and calendar. */
export function intlLocale(
  locale: Locale,
  opts: { digits?: DigitStyle; calendar?: CalendarPreference } = {},
): string {
  const ext: string[] = [];
  // Always pin the calendar: some ICU builds default ar-SA to the Hijri calendar.
  if (opts.calendar === 'islamic_umalqura') ext.push('ca-islamic-umalqura');
  else if (opts.calendar === 'gregory') ext.push('ca-gregory');
  // Arabic defaults to Arabic-Indic digits in ar-SA; force Latin digits when requested, and
  // Arabic-Indic for English UI if a user explicitly prefers them.
  if (opts.digits === 'western') ext.push('nu-latn');
  if (opts.digits === 'arabic_indic') ext.push('nu-arab');
  const base = LOCALE_META[locale].bcp47;
  return ext.length ? `${base}-u-${ext.join('-')}` : base;
}

/** A localized value stored at the data level. Arabic is mandatory; English may be missing. */
export interface LocalizedText {
  ar: string;
  en?: string | null;
}

/** Resolve a localized value, falling back to the other language rather than showing nothing. */
export function pickLocalized(value: LocalizedText | null | undefined, locale: Locale): string {
  if (!value) return '';
  if (locale === 'en') return value.en?.trim() ? value.en : value.ar;
  return value.ar?.trim() ? value.ar : (value.en ?? '');
}
