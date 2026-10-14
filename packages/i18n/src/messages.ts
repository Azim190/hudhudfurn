import ar from '../messages/ar.json';
import en from '../messages/en.json';
import type { Locale } from './locales';

/** Arabic is the source of truth for the catalog shape; English must match it key-for-key. */
export type Messages = typeof ar;

export const messages: Record<Locale, Messages> = { ar, en };

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

/** Flatten nested catalogs to dotted keys, e.g. `auth.otpTitle`. */
export function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? flattenKeys(v as Record<string, unknown>, key) : [key];
  });
}

/** Look up a dotted key and interpolate `{placeholders}`. Used server-side (API errors, SMS). */
export function translate(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), messages[locale]);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
