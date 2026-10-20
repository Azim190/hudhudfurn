import { formatDate, formatPrice, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { BookingOperations } from './booking-operations';
import { withBase } from '@/lib/base-path';

interface AdminBooking {
  id: string;
  number: string;
  type: string;
  status: string;
  fee: number;
  area: { id: string; nameAr: string; nameEn: string };
  slot: { date: string; start: string; end: string };
  address: { cityNameAr: string; cityNameEn: string; district: string | null; street: string | null; buildingNo: string | null; shortAddress: string | null };
  notes: string | null;
  contactName: string;
  contactPhoneE164: string;
  technicianId: string | null;
  feeOrder: { id: string; number: string; paymentState: string } | null;
  order: { id: string; number: string } | null;
  lat: string | null;
  lng: string | null;
  measurementsDetail: Array<{ id: string; roomLabel: string; widthMm: number; heightMm: number; mounting: string; notes: string | null; photos: Array<{ id: string }> }>;
  quotations: Array<{ id: string; number: string; status: string; total: number; orderId: string | null }>;
  events: Array<{ id: string; toStatus: string; note: string | null; createdAt: string }>;
}

export default async function AdminBookingPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireAdmin(locale);
  const [t, ts, ta] = await Promise.all([getTranslations('technician'), getTranslations('services'), getTranslations('admin')]);
  if (!can(me, 'services.read')) return <Alert>{ta('noAccess')}</Alert>;
  const b = await adminApi<AdminBooking>(`/admin/services/bookings/${id}`, locale).catch(() => null);
  if (!b) notFound();
  const technicians = await adminApi<Array<{ userId: string; name: string | null; profile: { isActive: boolean; areas: Array<{ id: string }> } | null }>>('/admin/services/technicians', locale);
  const eligible = technicians.filter((x) => x.profile?.isActive && x.profile.areas.some((a) => a.id === b.area.id)).map((x) => ({ id: x.userId, name: x.name ?? x.userId }));
  const when = (iso: string) => formatDate(iso, { locale, digits: 'western' }, { dateStyle: 'medium', timeStyle: 'short' });
  const a = b.address;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link href="/services/bookings" className="text-sm text-brand-700 hover:underline">
        {t('bookings')}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold" dir="ltr">
          {b.number}
        </h1>
        <Badge>{ts(`status_${b.status}` as 'status_CONFIRMED')}</Badge>
        <span className="text-sm text-ink-500">{ts(b.type === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')}</span>
      </div>

      <BookingOperations bookingId={b.id} status={b.status} technicianId={b.technicianId} technicians={eligible} canAssign={can(me, 'services.assign')} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-1 p-5 text-sm">
          <p className="font-semibold">{b.contactName}</p>
          <p dir="ltr" className="text-start">
            {b.contactPhoneE164}
          </p>
          <p>{[a.buildingNo, a.street, a.district, locale === 'en' ? a.cityNameEn : a.cityNameAr].filter(Boolean).join('، ')}</p>
          {a.shortAddress && <p className="font-mono">{a.shortAddress}</p>}
          {b.lat && b.lng && (
            <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
              {t('mapPin')}
            </a>
          )}
          {b.notes && <p className="mt-2 rounded-lg bg-sand-100 p-2" dir="auto">{b.notes}</p>}
        </Card>
        <Card className="flex flex-col gap-1 p-5 text-sm">
          <p>
            {formatDate(`${b.slot.date}T12:00:00+03:00`, { locale, digits: 'western' }, { dateStyle: 'full' })} ·{' '}
            <span dir="ltr">
              {b.slot.start}–{b.slot.end}
            </span>
          </p>
          <p>{locale === 'en' ? b.area.nameEn : b.area.nameAr}</p>
          <p>
            {ts('fee')}: {b.fee ? formatPrice(b.fee, { locale, digits: 'western' }) : ts('freeVisit')}
            {b.feeOrder && (
              <Link href={`/orders/${b.feeOrder.id}`} className="ms-2 text-brand-700 hover:underline" dir="ltr">
                {b.feeOrder.number}
              </Link>
            )}
          </p>
          {b.order && (
            <Link href={`/orders/${b.order.id}`} className="text-brand-700 hover:underline">
              {t('forOrder', { number: b.order.number })}
            </Link>
          )}
        </Card>
      </div>

      {b.measurementsDetail.length > 0 && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold">{t('measurements')}</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {b.measurementsDetail.map((m) => (
              <li key={m.id} className="rounded-lg bg-sand-100 p-3">
                <p className="font-medium">
                  {m.roomLabel} · <span dir="ltr">{m.widthMm / 10} × {m.heightMm / 10} cm</span> · {t(`mounting_${m.mounting}`)}
                </p>
                {m.notes && <p className="text-ink-500">{m.notes}</p>}
                {m.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.photos.map((p) => (
                      <a key={p.id} href={withBase(`/bff/files/services/uploads/${p.id}`)} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private photo through the admin proxy */}
                        <img src={withBase(`/bff/files/services/uploads/${p.id}`)} alt="" className="size-20 rounded object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {b.quotations.length > 0 && (
        <Card className="p-5 text-sm">
          <h2 className="text-lg font-semibold">{ts('quotations')}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {b.quotations.map((q) => (
              <li key={q.id} className="flex justify-between">
                <span dir="ltr">{q.number}</span>
                <span>
                  {formatPrice(q.total, { locale, digits: 'western' })} · {ts(`quotation_${q.status}` as 'quotation_SENT')}
                  {q.orderId && (
                    <Link href={`/orders/${q.orderId}`} className="ms-2 text-brand-700 hover:underline">
                      ↗
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5 text-sm">
        <h2 className="text-lg font-semibold">{ta('history')}</h2>
        <ol className="mt-3 flex flex-col gap-2 border-s border-sand-300 ps-4">
          {b.events.map((e) => (
            <li key={e.id}>
              <span className="font-medium">{ts(`status_${e.toStatus}` as 'status_CONFIRMED')}</span> <span className="text-ink-500">· {when(e.createdAt)}</span>
              {e.note && <p className="text-xs text-ink-500">{e.note}</p>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
