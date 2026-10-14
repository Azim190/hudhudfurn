import { DEFAULT_LOCALE, LOCALES } from '@hudhud/i18n';
import { defineRouting } from 'next-intl/routing';

/** Every page lives under /ar/... or /en/... (separate localized URLs for SEO). */
export const routing = defineRouting({
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
});
