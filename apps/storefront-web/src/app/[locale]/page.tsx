import { ChevronForward } from '@hudhud/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

const VERTICALS = [
  { href: '/c/curtains', key: 'nav.curtains', tone: 'from-brand-100 to-sand-100' },
  { href: '/c/bedding', key: 'nav.bedding', tone: 'from-sand-200 to-sand-50' },
  { href: '/c/sofa-covers', key: 'nav.sofaCovers', tone: 'from-sand-100 to-brand-50' },
  { href: '/c/abayas', key: 'nav.abayas', tone: 'from-ink-900/10 to-sand-100' },
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-sand-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <h1 className="max-w-2xl text-4xl font-bold text-ink-900 sm:text-5xl">{t('home.heroTitle')}</h1>
          <p className="mt-4 max-w-xl text-lg text-ink-700">{t('home.heroSubtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/c/curtains"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 font-medium text-white hover:bg-brand-700"
            >
              {t('home.shopNow')}
              <ChevronForward />
            </Link>
            <Link
              href="/services/measurement"
              className="inline-flex h-12 items-center rounded-xl border border-sand-300 bg-white px-6 font-medium text-ink-900 hover:bg-sand-100"
            >
              {t('home.bookVisit')}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="by-category">
        <h2 id="by-category" className="text-2xl font-semibold">
          {t('home.shopByCategory')}
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {VERTICALS.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                className={`group flex aspect-[4/5] flex-col justify-end rounded-card bg-gradient-to-br ${v.tone} p-5 shadow-card transition hover:-translate-y-0.5`}
              >
                <span className="flex items-center justify-between text-lg font-semibold text-ink-900">
                  {t(v.key)}
                  <ChevronForward className="opacity-60 transition group-hover:opacity-100" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
