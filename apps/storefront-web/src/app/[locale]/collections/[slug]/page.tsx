import { isLocale } from '@hudhud/i18n';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ListingView } from '@/components/listing-view';
import { getCollection, listingQuery, listProducts, parseListingParams } from '@/lib/catalog-api';
import { pick } from '@/lib/catalog-types';
import { slugAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const c = await getCollection(decodeURIComponent(slug));
  return {
    title: pick(locale, c.nameAr, c.nameEn),
    description: pick(locale, c.descriptionAr, c.descriptionEn).slice(0, 170),
    alternates: slugAlternates(locale, '/collections', { ar: c.slugAr, en: c.slugEn }),
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const sp = await searchParams;
  const collection = await getCollection(decodeURIComponent(slug));
  const listing = await listProducts(listingQuery({ ...parseListingParams(sp), collection: collection.slugEn }));
  const name = pick(locale, collection.nameAr, collection.nameEn);

  return (
    <ListingView
      listing={listing}
      facets={[]}
      basePath={`/collections/${encodeURIComponent(locale === 'en' ? collection.slugEn : collection.slugAr)}`}
      query={sp}
      header={
        <>
          <Breadcrumbs items={[{ label: name }]} />
          <h1 className="mt-4 text-3xl font-bold">{name}</h1>
          {pick(locale, collection.descriptionAr, collection.descriptionEn) && <p className="mt-2 max-w-3xl text-ink-700">{pick(locale, collection.descriptionAr, collection.descriptionEn)}</p>}
        </>
      }
    />
  );
}
