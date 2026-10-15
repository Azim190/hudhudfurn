import { normalizeArabic } from '../search/arabic-normalize';

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/**
 * URL slug for a localized name. Arabic slugs keep Arabic letters (browsers display them
 * natively and search engines index them), dropping diacritics and tatweel. English slugs are
 * lowercase ASCII.
 */
export function slugify(text: string, locale: 'ar' | 'en'): string {
  const base =
    locale === 'ar'
      ? text.normalize('NFKC').replace(TASHKEEL, '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      : text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const allowed = locale === 'ar' ? /[^ء-يٱ-ۓa-z0-9]+/g : /[^a-z0-9]+/g;
  return base
    .toLowerCase()
    .replace(/&/g, locale === 'ar' ? ' و ' : ' and ')
    .replace(allowed, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
    .replace(/-$/, '');
}

/** Append -2, -3, ... until the slug is not taken. */
export function uniqueSlug(base: string, isTaken: (slug: string) => boolean): string {
  const root = base || 'item';
  if (!isTaken(root)) return root;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${root}-${i}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error(`Could not find a free slug for "${root}"`);
}

/** Search key that ignores Arabic spelling variants, for duplicate-name detection. */
export function nameKey(text: string): string {
  return normalizeArabic(text).replace(/[^\p{L}\p{N}]+/gu, '');
}
