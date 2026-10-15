import { apiFetch } from '@hudhud/web-core';
import type { MetadataRoute } from 'next';
import type { CategoryNode, Listing } from '@/lib/catalog-types';
import { siteUrl } from '@/lib/seo';

export const revalidate = 3600;
const MAX_PAGES = 40; // 4,000 products per sitemap; split into a sitemap index beyond that

type Entry = MetadataRoute.Sitemap[number];

function entry(prefix: string, slugs: { ar: string; en: string }, priority: number, lastModified?: Date): Entry[] {
  const url = (l: 'ar' | 'en') => `${siteUrl()}/${l}${prefix}${slugs[l] ? `/${encodeURIComponent(slugs[l])}` : ''}`;
  const languages = { ar: url('ar'), en: url('en') };
  return (['ar', 'en'] as const).map((l) => ({ url: url(l), changeFrequency: 'daily' as const, priority, lastModified, alternates: { languages } }));
}

/** Localized sitemap (both languages, hreflang alternates) for the home page, categories and products. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items: MetadataRoute.Sitemap = entry('', { ar: '', en: '' }, 1);
  try {
    const tree = await apiFetch<CategoryNode[]>('/categories', { revalidate: 3600, tags: ['catalog'] });
    const walk = (nodes: CategoryNode[]) => nodes.forEach((c) => (items.push(...entry('/c', { ar: c.slugAr, en: c.slugEn }, 0.8)), walk(c.children)));
    walk(tree);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const listing = await apiFetch<Listing>(`/products?limit=100&page=${page}&sort=newest`, { revalidate: 3600, tags: ['catalog'] });
      for (const p of listing.items) items.push(...entry('/p', { ar: p.slugAr, en: p.slugEn }, 0.6));
      if (page * listing.limit >= listing.total) break;
    }
  } catch {
    // The sitemap still lists the home page if the API is briefly unavailable.
  }
  return items;
}
