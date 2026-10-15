import { isLocale } from '@hudhud/i18n';
import { apiFetch } from '@hudhud/web-core';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductGrid } from '@/components/product-card';
import { RecentlyViewed } from '@/components/recently-viewed';
import { getProduct } from '@/lib/catalog-api';
import { pick, type ProductDetail } from '@/lib/catalog-types';
import { getStoreInfo } from '@/lib/server';
import { siteUrl, slugAlternates } from '@/lib/seo';
import { ProductExperience } from './product-experience';

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Product pages are cached (ISR) and refreshed on demand when the catalog changes. */
export const revalidate = 300;

/** No build-time list: each product page is rendered on first request, then cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const p = await getProduct(decodeURIComponent(slug));
  const title = pick(locale, p.seo.titleAr || p.nameAr, p.seo.titleEn || p.nameEn);
  const description = pick(locale, p.seo.descriptionAr || p.descriptionAr, p.seo.descriptionEn || p.descriptionEn).slice(0, 170);
  const image = p.media[0]?.renditions.find((r) => r.format === 'webp' && r.width >= 960)?.url ?? p.media[0]?.url;
  return {
    title,
    description,
    alternates: slugAlternates(locale, '/p', { ar: p.slugAr, en: p.slugEn }),
    openGraph: { title, description, type: 'website', images: image ? [{ url: image }] : undefined },
  };
}

interface Reviews {
  items: Array<{ id: string; rating: number; title: string | null; body: string | null; authorName: string | null; createdAt: string }>;
  total: number;
  ratingAvg: number;
  ratingCount: number;
}

function productJsonLd(p: ProductDetail, locale: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: pick(locale, p.nameAr, p.nameEn),
    description: pick(locale, p.descriptionAr, p.descriptionEn),
    sku: p.variants[0]?.sku,
    image: p.media.map((m) => m.url),
    url,
    offers: p.variants.map((v) => ({
      '@type': 'Offer',
      sku: v.sku,
      priceCurrency: 'SAR',
      price: (v.price / 100).toFixed(2),
      availability: v.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url,
    })),
    ...(p.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.ratingAvg, reviewCount: p.ratingCount } } : {}),
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const product = await getProduct(decodeURIComponent(slug));
  const [t, store, reviews, cities] = await Promise.all([
    getTranslations('shop'),
    getStoreInfo(),
    apiFetch<Reviews>(`/products/${product.id}/reviews?limit=6`, { revalidate: 300, tags: ['catalog'] }).catch(() => null),
    apiFetch<Array<{ code: string; nameAr: string; nameEn: string }>>('/geo/cities', { revalidate: 3600 }).catch(() => []),
  ]);
  const url = `${siteUrl()}/${locale}/p/${encodeURIComponent(locale === 'en' ? product.slugEn : product.slugAr)}`;
  const slugOf = (c: { slugAr: string; slugEn: string }) => encodeURIComponent(locale === 'en' ? c.slugEn : c.slugAr);
  const description = pick(locale, product.descriptionAr, product.descriptionEn);
  const care = pick(locale, product.careAr, product.careEn);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Breadcrumbs items={[...product.breadcrumb.map((b) => ({ label: pick(locale, b.nameAr, b.nameEn), href: `/c/${slugOf(b)}` })), { label: pick(locale, product.nameAr, product.nameEn) }]} />

      <ProductExperience product={product} whatsapp={store?.contact.whatsapp ?? ''} productUrl={url} cities={cities} />

      <div className="mt-12 grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-8">
          {description && (
            <section aria-labelledby="desc">
              <h2 id="desc" className="text-xl font-semibold">
                {t('description')}
              </h2>
              <p className="mt-3 leading-loose whitespace-pre-line text-ink-700">{description}</p>
            </section>
          )}
          {product.attributes.length > 0 && (
            <section aria-labelledby="details">
              <h2 id="details" className="text-xl font-semibold">
                {t('details')}
              </h2>
              <dl className="mt-3 divide-y divide-sand-200 rounded-card bg-white shadow-card">
                {product.attributes.map((a) => (
                  <div key={a.key} className="grid grid-cols-[1fr_2fr] gap-4 px-4 py-3 text-sm">
                    <dt className="text-ink-500">{pick(locale, a.nameAr, a.nameEn)}</dt>
                    <dd>{a.values.map((v) => pick(locale, v.labelAr, v.labelEn)).join('، ')}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {care && (
            <section aria-labelledby="care">
              <h2 id="care" className="text-xl font-semibold">
                {t('care')}
              </h2>
              <p className="mt-3 text-ink-700">{care}</p>
            </section>
          )}
        </div>

        <section aria-labelledby="reviews" className="rounded-card bg-white p-5 shadow-card">
          <h2 id="reviews" className="text-xl font-semibold">
            {t('reviews')}
          </h2>
          {reviews && reviews.total > 0 ? (
            <>
              <p className="mt-2 text-sm text-ink-700">
                <span aria-hidden="true" className="text-accent-500">
                  {'★'.repeat(Math.round(reviews.ratingAvg))}
                </span>{' '}
                {t('ratingOutOf', { rating: reviews.ratingAvg.toFixed(1) })} · {t('reviewsCount', { count: reviews.ratingCount })}
              </p>
              <ul className="mt-4 flex flex-col gap-4">
                {reviews.items.map((r) => (
                  <li key={r.id} className="border-t border-sand-200 pt-4 text-sm">
                    <p className="font-medium">
                      <span aria-label={t('ratingOutOf', { rating: r.rating })} className="text-accent-500">
                        {'★'.repeat(r.rating)}
                      </span>{' '}
                      {r.authorName}
                    </p>
                    {r.body && <p className="mt-1 text-ink-700">{r.body}</p>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-700">{t('noReviews')}</p>
              <p className="mt-1 text-xs text-ink-500">{t('reviewsAfterPurchase')}</p>
            </>
          )}
        </section>
      </div>

      {product.related.completeTheLook.length > 0 && (
        <section aria-labelledby="look" className="mt-16">
          <h2 id="look" className="mb-6 text-2xl font-semibold">
            {t('completeTheLook')}
          </h2>
          <ProductGrid products={product.related.completeTheLook} />
        </section>
      )}
      {product.related.similar.length > 0 && (
        <section aria-labelledby="similar" className="mt-16">
          <h2 id="similar" className="mb-6 text-2xl font-semibold">
            {t('youMayLike')}
          </h2>
          <ProductGrid products={[...product.related.crossSell, ...product.related.similar].slice(0, 8)} />
        </section>
      )}
      <RecentlyViewed excludeId={product.id} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product, locale, url)).replace(/</g, '\\u003c') }} />
    </div>
  );
}
