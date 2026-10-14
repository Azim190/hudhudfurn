import { LOCALES } from '@hudhud/i18n';
import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

/** Localized sitemap with hreflang alternates. Catalog URLs are added in Phase 2. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['', '/c/curtains', '/c/bedding', '/c/sofa-covers', '/c/abayas'];
  return paths.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${siteUrl()}/${locale}${path}`,
      changeFrequency: 'daily' as const,
      priority: path === '' ? 1 : 0.8,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${siteUrl()}/${l}${path}`])) },
    })),
  );
}
