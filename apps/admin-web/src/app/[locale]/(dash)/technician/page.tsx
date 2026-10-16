import { formatDate, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { can, requireAdmin, technicianApi } from '@/lib/server';

interface Job {
  id: string;
  number: string;
  type: 'MEASUREMENT' | 'INSTALLATION';
  status: string;
  slot: { date: string; start: string; end: string };
  customer: { name: string; phone: string; masked: boolean };
  address: { cityNameAr: string; cityNameEn: string; district: string | null; street: string | null };
  navigationUrl: string;
}

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export default async function TechnicianJobsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ date?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations('technician');
  if (!can(me, 'services.technician')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  const date = (await searchParams).date;
  const data = await technicianApi<{ date: string; items: Job[] }>(`/technician/jobs${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : ''}`, locale);
  const ts = await getTranslations('services');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{t('myJobs')}</h1>
      <nav className="mt-4 flex items-center justify-between text-sm" aria-label={t('day')}>
        <Link href={`/technician?date=${shift(data.date, -1)}`} className="rounded-lg border border-sand-300 bg-white px-3 py-2">
          ‹ {t('previousDay')}
        </Link>
        <span className="font-medium">{formatDate(`${data.date}T12:00:00+03:00`, { locale, digits: 'western' }, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <Link href={`/technician?date=${shift(data.date, 1)}`} className="rounded-lg border border-sand-300 bg-white px-3 py-2">
          {t('nextDay')} ›
        </Link>
      </nav>
      {data.items.length === 0 ? (
        <Card className="mt-6 p-8 text-center text-ink-500">{t('noJobs')}</Card>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {data.items.map((j) => (
            <li key={j.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/technician/${j.id}`} className="font-semibold text-brand-700 hover:underline">
                    <span dir="ltr">
                      {j.slot.start}–{j.slot.end}
                    </span>{' '}
                    · {ts(j.type === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')}
                  </Link>
                  <Badge>{ts(`status_${j.status}` as 'status_CONFIRMED')}</Badge>
                </div>
                <p className="mt-1 text-sm">{j.customer.name}</p>
                <p className="text-sm text-ink-500">{[j.address.street, j.address.district, locale === 'en' ? j.address.cityNameEn : j.address.cityNameAr].filter(Boolean).join('، ')}</p>
                <div className="mt-3 flex gap-2">
                  <a href={j.navigationUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white">
                    {t('navigate')}
                  </a>
                  <Link href={`/technician/${j.id}`} className="rounded-lg border border-sand-300 px-3 py-2 text-sm font-medium">
                    {t('openJob')}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
