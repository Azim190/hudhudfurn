import { formatDate, isLocale } from '@hudhud/i18n';
import { Badge, Card } from '@hudhud/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { getMyBookings, getMyQuotations } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'services' }))('myBookings'), robots: { index: false } };
}

export default async function MyBookingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const [bookings, quotations] = await Promise.all([getMyBookings(locale), getMyQuotations(locale)]);
  if (!bookings) redirect({ href: '/login?next=/account/bookings', locale });
  const t = await getTranslations('services');
  const day = (iso: string) => formatDate(`${iso}T12:00:00+03:00`, { locale, digits: 'western' }, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('myBookings')}</h1>
        <Link href="/services/book" className="inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 font-medium text-white hover:bg-brand-700">
          {t('bookTitle')}
        </Link>
      </div>
      {(quotations ?? []).some((q) => q.status === 'SENT') && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('openQuotations')}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {quotations!
              .filter((q) => q.status === 'SENT')
              .map((q) => (
                <li key={q.id}>
                  <Link href={`/quotations/${q.number}`} className="block rounded-card bg-brand-50 p-4 font-medium text-brand-700 hover:underline">
                    {t('quotationNumber', { number: q.number })}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
      {bookings!.length === 0 ? (
        <Card className="mt-8 p-10 text-center text-ink-500">{t('noBookings')}</Card>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {bookings!.map((b) => (
            <li key={b.id}>
              <Link href={`/account/bookings/${b.id}`} className="block rounded-card bg-white p-5 shadow-card hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {t(b.type === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')} · <span dir="ltr">{b.number}</span>
                  </span>
                  <Badge>{t(`status_${b.status}` as 'status_CONFIRMED')}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {day(b.slot.date)} · <span dir="ltr">{b.slot.start}–{b.slot.end}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
