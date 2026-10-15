import { LOCALES, type Locale } from '@hudhud/i18n';
import type { Metadata } from 'next';

export function siteUrl(): string {
  return (process.env.STOREFRONT_URL ?? 'http://localhost:3100').replace(/\/$/, '');
}

/**
 * Canonical URL plus hreflang alternates for a path that exists in every locale.
 * `path` is locale-less, e.g. "/" or "/account".
 */
export function localizedAlternates(locale: Locale, path: string): Metadata['alternates'] {
  const clean = path === '/' ? '' : path;
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${siteUrl()}/${l}${clean}`]));
  return {
    canonical: `${siteUrl()}/${locale}${clean}`,
    languages: { ...languages, 'x-default': `${siteUrl()}/ar${clean}` },
  };
}

/** Alternates for pages whose slug differs per language (categories, products, collections). */
export function slugAlternates(locale: Locale, prefix: string, slugs: { ar: string; en: string }): Metadata['alternates'] {
  const url = (l: Locale) => `${siteUrl()}/${l}${prefix}/${encodeURIComponent(l === 'en' ? slugs.en : slugs.ar)}`;
  return { canonical: url(locale), languages: { ar: url('ar'), en: url('en'), 'x-default': url('ar') } };
}
