import { ChevronForward } from '@hudhud/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroCarousel } from '@/components/hero-carousel';
import { ProductGrid } from '@/components/product-card';
import { RecentlyViewed } from '@/components/recently-viewed';
import { Link } from '@/i18n/navigation';
import { getHome } from '@/lib/catalog-api';
import { pick } from '@/lib/catalog-types';

/** Cached (ISR); refreshed on demand when banners, collections or the catalog change. */
export const revalidate = 300;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, home] = await Promise.all([getTranslations(), getHome().catch(() => null)]);
  const slugOf = (c: { slugAr: string; slugEn: string }) => encodeURIComponent(locale === 'en' ? c.slugEn : c.slugAr);

  return (
    <>
      {home && home.hero.length > 0 ? (
        <HeroCarousel banners={home.hero} />
      ) : (
        <section className="bg-gradient-to-b from-brand-50 to-sand-50">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
            <h1 className="max-w-2xl text-4xl font-bold text-ink-900 sm:text-5xl">{t('home.heroTitle')}</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-700">{t('home.heroSubtitle')}</p>
            {home?.categories[0] && (
              <Link href={`/c/${slugOf(home.categories[0])}`} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 font-medium text-white hover:bg-brand-700">
                {t('home.shopNow')}
                <ChevronForward />
              </Link>
            )}
          </div>
        </section>
      )}
      {/* The visible page title when a banner carousel replaces the static hero. */}
      {home && home.hero.length > 0 && <h1 className="sr-only">{t('common.storeName')} – {t('common.tagline')}</h1>}

      {home && home.categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="by-category">
          <h2 id="by-category" className="text-2xl font-semibold">
            {t('home.shopByCategory')}
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {home.categories.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${slugOf(c)}`} className="group relative block overflow-hidden rounded-card bg-sand-100 shadow-card">
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- category cover rendition
                    <img src={c.imageUrl} alt="" width={320} height={400} loading="lazy" className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-ink-900/70 to-transparent p-4 pt-12 text-lg font-semibold text-white">
                    {pick(locale, c.nameAr, c.nameEn)}
                    <ChevronForward className="opacity-80 transition group-hover:opacity-100" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {home?.collections.map((col) => (
        <section key={col.id} className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-labelledby={`col-${col.id}`}>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 id={`col-${col.id}`} className="text-2xl font-semibold">
                {pick(locale, col.nameAr, col.nameEn)}
              </h2>
              {pick(locale, col.descriptionAr, col.descriptionEn) && <p className="mt-1 text-ink-500">{pick(locale, col.descriptionAr, col.descriptionEn)}</p>}
            </div>
            <Link href={`/collections/${slugOf(col)}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              {t('shop.viewAll')}
              <ChevronForward className="size-4" />
            </Link>
          </div>
          <ProductGrid products={col.products.slice(0, 8)} />
        </section>
      ))}

      {home?.strip.map((b) => (
        <section key={b.id} className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Link href={b.link ?? '/'} className="block rounded-card bg-brand-700 px-6 py-8 text-white">
            <p className="text-xl font-semibold">{pick(locale, b.titleAr, b.titleEn)}</p>
            {pick(locale, b.subtitleAr, b.subtitleEn) && <p className="mt-1 text-white/80">{pick(locale, b.subtitleAr, b.subtitleEn)}</p>}
          </Link>
        </section>
      ))}

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <RecentlyViewed />
      </div>
    </>
  );
}
