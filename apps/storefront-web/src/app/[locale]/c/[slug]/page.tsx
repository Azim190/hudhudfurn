import { isLocale } from '@hudhud/i18n';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ListingView } from '@/components/listing-view';
import { Link } from '@/i18n/navigation';
import { getCategory, listingQuery, listProducts, parseListingParams } from '@/lib/catalog-api';
import { pick } from '@/lib/catalog-types';
import { slugAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const c = await getCategory(decodeURIComponent(slug));
  const filtered = Object.keys(await searchParams).some((k) => k.startsWith('f.') || k === 'sort' || k.startsWith('price'));
  return {
    title: pick(locale, c.seoTitleAr || c.nameAr, c.seoTitleEn || c.nameEn),
    description: pick(locale, c.seoDescriptionAr || c.descriptionAr, c.seoDescriptionEn || c.descriptionEn).slice(0, 170),
    alternates: slugAlternates(locale, '/c', { ar: c.slugAr, en: c.slugEn }),
    // Filtered permutations are not indexed; the canonical category page is.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const sp = await searchParams;
  const category = await getCategory(decodeURIComponent(slug));
  const listing = await listProducts(listingQuery({ ...parseListingParams(sp), category: category.slugEn }));
  const name = pick(locale, category.nameAr, category.nameEn);
  const slugOf = (c: { slugAr: string; slugEn: string }) => encodeURIComponent(locale === 'en' ? c.slugEn : c.slugAr);

  return (
    <ListingView
      listing={listing}
      facets={category.facets}
      basePath={`/c/${slugOf(category)}`}
      query={sp}
      header={
        <>
          <Breadcrumbs items={[...category.breadcrumb.map((b) => ({ label: pick(locale, b.nameAr, b.nameEn), href: `/c/${slugOf(b)}` })), { label: name }]} />
          <h1 className="mt-4 text-3xl font-bold">{name}</h1>
          {pick(locale, category.descriptionAr, category.descriptionEn) && (
            <p className="mt-2 max-w-3xl text-ink-700">{pick(locale, category.descriptionAr, category.descriptionEn)}</p>
          )}
          {category.children.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {category.children.map((c) => (
                <li key={c.id}>
                  <Link href={`/c/${slugOf(c)}`} className="inline-block rounded-full border border-sand-300 bg-white px-4 py-2 text-sm hover:border-brand-500 hover:text-brand-700">
                    {pick(locale, c.nameAr, c.nameEn)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  );
}
