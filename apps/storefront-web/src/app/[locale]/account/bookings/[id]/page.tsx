import { formatDate, formatPrice, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { isUuid } from '@/lib/order-access';
import { getBooking } from '@/lib/services';
import { BookingActions } from './booking-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'services' }))('myBookings'), robots: { index: false } };
}

export default async function BookingPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ booked?: string }> }) {
  const [{ locale, id }, { booked }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale) || !isUuid(id)) notFound();
  setRequestLocale(locale);
  const b = await getBooking(id, locale);
  if (!b) notFound();
  const t = await getTranslations('services');
  const day = formatDate(`${b.slot.date}T12:00:00+03:00`, { locale, digits: 'western' }, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const a = b.address;
  const open = ['REQUESTED', 'CONFIRMED', 'ASSIGNED'].includes(b.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {booked === '1' && <Alert tone="success" className="mb-6">{t('bookedThanks')}</Alert>}
      {b.status === 'REQUESTED' && b.feeOrder && (
        <Alert tone="info" className="mb-6">
          {t('awaitingPayment')}{' '}
          <Link href={`/orders/${b.feeOrder.id}`} className="font-medium underline">
            {t('payFee')}
          </Link>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" data-testid="booking-number">
          {t(b.type === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')} · <span dir="ltr">{b.number}</span>
        </h1>
        <Badge>{t(`status_${b.status}` as 'status_CONFIRMED')}</Badge>
      </div>

      <Card className="mt-6 grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <p className="text-ink-500">{t('when')}</p>
          <p className="font-medium">
            {day} · <span dir="ltr">{b.slot.start}–{b.slot.end}</span>
          </p>
        </div>
        <div>
          <p className="text-ink-500">{t('where')}</p>
          <p className="font-medium">{[a.buildingNo, a.street, a.district, locale === 'en' ? a.cityNameEn : a.cityNameAr].filter(Boolean).join('، ')}</p>
        </div>
        {b.technician?.name && (
          <div>
            <p className="text-ink-500">{t('technician')}</p>
            <p className="font-medium">{b.technician.name}</p>
          </div>
        )}
        <div>
          <p className="text-ink-500">{t('fee')}</p>
          <p className="font-medium">{b.fee ? formatPrice(b.fee, { locale, digits: 'western' }) : t('freeVisit')}</p>
        </div>
      </Card>

      {b.quotations.length > 0 && (
        <Card className="mt-6 p-5 text-sm">
          <h2 className="text-lg font-semibold">{t('quotations')}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {b.quotations.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3">
                <Link href={`/quotations/${q.number}`} className="font-medium text-brand-700 hover:underline" dir="ltr">
                  {q.number}
                </Link>
                <span>
                  {formatPrice(q.total, { locale, digits: 'western' })} · {t(`quotation_${q.status}` as 'quotation_SENT')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open && b.canChange && <BookingActions bookingId={b.id} cityCode={a.cityCode} type={b.type} />}
      {open && !b.canChange && (
        <Alert tone="info" className="mt-6">
          {t('changeClosed')}
        </Alert>
      )}
    </div>
  );
}
