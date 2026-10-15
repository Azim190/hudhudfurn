import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { FacetDefinition, Listing } from '@/lib/catalog-types';
import { FilterPanel, SortSelect } from './listing-controls';
import { ProductGrid } from './product-card';

/** Shared category / collection / search results layout (server-rendered from URL parameters). */
export async function ListingView({
  listing,
  facets,
  basePath,
  query,
  header,
}: {
  listing: Listing;
  facets: FacetDefinition[];
  basePath: string;
  query: Record<string, string | string[] | undefined>;
  header: ReactNode;
}) {
  const t = await getTranslations('shop');
  const pages = Math.max(1, Math.ceil(listing.total / listing.limit));
  const pageHref = (page: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (typeof v === 'string' && k !== 'page') qs.set(k, v);
    if (page > 1) qs.set('page', String(page));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {header}
      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <FilterPanel facets={facets} facetCounts={listing.facetCounts} priceRange={listing.priceRange} />
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500" role="status">
              {t('results', { count: listing.total })}
            </p>
            <SortSelect hasQuery={typeof query.q === 'string' && query.q.length > 0} />
          </div>
          {listing.degraded && <p className="mb-4 rounded-lg bg-sand-100 px-3 py-2 text-sm text-ink-700">{t('degraded')}</p>}
          {listing.items.length === 0 ? (
            <div className="rounded-card bg-white p-12 text-center shadow-card">
              <p className="text-lg font-semibold">{t('noResults')}</p>
              <p className="mt-2 text-sm text-ink-500">{t('noResultsHint')}</p>
            </div>
          ) : (
            <ProductGrid products={listing.items} priorityCount={4} />
          )}
          {pages > 1 && (
            <nav className="mt-10 flex items-center justify-between text-sm" aria-label="pagination">
              {listing.page > 1 ? (
                <Link href={pageHref(listing.page - 1)} rel="prev" className="rounded-xl border border-sand-300 bg-white px-4 py-2 hover:bg-sand-100">
                  {t('previous')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ink-500">{t('pageOf', { page: listing.page, pages })}</span>
              {listing.page < pages ? (
                <Link href={pageHref(listing.page + 1)} rel="next" className="rounded-xl border border-sand-300 bg-white px-4 py-2 hover:bg-sand-100">
                  {t('next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
