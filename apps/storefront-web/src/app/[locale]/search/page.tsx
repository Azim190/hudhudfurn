import { isLocale } from '@hudhud/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ListingView } from '@/components/listing-view';
import { listingQuery, listProducts, parseListingParams } from '@/lib/catalog-api';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'shop' }))('searchTitle'), robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const sp = await searchParams;
  const parsed = parseListingParams(sp);
  const t = await getTranslations('shop');
  const listing = await listProducts(listingQuery(parsed));

  return (
    <ListingView
      listing={listing}
      facets={[]}
      basePath="/search"
      query={sp}
      header={
        <>
          <Breadcrumbs items={[{ label: t('searchTitle') }]} />
          <h1 className="mt-4 text-3xl font-bold">{parsed.q ? t('searchResultsFor', { q: parsed.q }) : t('searchTitle')}</h1>
        </>
      }
    />
  );
}
