import { BOOKING_STATUSES } from '@hudhud/domain';
import { formatDate, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { adminApi, can, requireAdmin } from '@/lib/server';

interface Row {
  id: string;
  number: string;
  type: string;
  status: string;
  slot: { date: string; start: string; end: string };
  area: { nameAr: string; nameEn: string };
  contactName: string;
  contactPhoneE164: string;
  technician: { name: string | null } | null;
}

const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'technician' }))('bookings') };
}

export default async function BookingsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ from?: string; to?: string; status?: string; q?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const [t, ts, ta] = await Promise.all([getTranslations('technician'), getTranslations('services'), getTranslations('admin')]);
  if (!can(me, 'services.read')) return <Alert>{ta('noAccess')}</Alert>;
  const sp = await searchParams;
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const from = valid(sp.from) ?? today();
  const to = valid(sp.to) ?? plus(from, 7);
  const status = BOOKING_STATUSES.find((s) => s === sp.status);
  const qs = new URLSearchParams({ from, to, limit: '100', ...(status ? { status } : {}), ...(sp.q ? { q: sp.q.slice(0, 60) } : {}) });
  const data = await adminApi<{ items: Row[]; total: number }>(`/admin/services/bookings?${qs}`, locale);
  const byDay = new Map<string, Row[]>();
  for (const b of data.items) byDay.set(b.slot.date, [...(byDay.get(b.slot.date) ?? []), b]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('bookings')}</h1>
        <div className="flex gap-2 text-sm">
          {can(me, 'services.manage') && (
            <Link href="/services/areas" className="rounded-lg border border-sand-300 bg-white px-3 py-2">
              {t('areas')}
            </Link>
          )}
          <Link href="/services/technicians" className="rounded-lg border border-sand-300 bg-white px-3 py-2">
            {t('technicians')}
          </Link>
        </div>
      </div>
      <form className="mt-6 flex flex-wrap items-end gap-3 text-sm" role="search">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t('from')}</span>
          <input type="date" name="from" defaultValue={from} className="h-11 rounded-xl border border-sand-300 bg-white px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t('to')}</span>
          <input type="date" name="to" defaultValue={to} className="h-11 rounded-xl border border-sand-300 bg-white px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{ta('status')}</span>
          <select name="status" defaultValue={status ?? ''} className="h-11 rounded-xl border border-sand-300 bg-white px-3">
            <option value="">{ta('allStatuses')}</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(`status_${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-medium">{ta('search')}</span>
          <input name="q" defaultValue={sp.q ?? ''} className="h-11 rounded-xl border border-sand-300 bg-white px-3" />
        </label>
        <button className="h-11 rounded-xl bg-brand-600 px-5 font-medium text-white">{ta('search')}</button>
      </form>

      {data.items.length === 0 ? (
        <Card className="mt-6 p-6 text-sm text-ink-500">{ta('noResults')}</Card>
      ) : (
        [...byDay.entries()].map(([day, rows]) => (
          <section key={day} className="mt-6">
            <h2 className="text-sm font-semibold text-ink-700">{formatDate(`${day}T12:00:00+03:00`, { locale, digits: 'western' }, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <Card className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className="border-b border-sand-100 last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap" dir="ltr">
                        <span className="block text-start">
                          {b.slot.start}–{b.slot.end}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/services/bookings/${b.id}`} className="font-medium text-brand-700 hover:underline" dir="ltr">
                          {b.number}
                        </Link>
                        <span className="block text-xs text-ink-500">{ts(b.type === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')}</span>
                      </td>
                      <td className="px-4 py-3">
                        {b.contactName}
                        <span className="block text-xs text-ink-500" dir="ltr">
                          {b.contactPhoneE164}
                        </span>
                      </td>
                      <td className="px-4 py-3">{locale === 'en' ? b.area.nameEn : b.area.nameAr}</td>
                      <td className="px-4 py-3">{b.technician?.name ?? <span className="text-danger-600">{t('unassigned')}</span>}</td>
                      <td className="px-4 py-3">
                        <Badge>{ts(`status_${b.status}` as 'status_CONFIRMED')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
